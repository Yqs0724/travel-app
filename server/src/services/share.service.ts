import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { readReceiptFile } from "../lib/uploads.js";
import { settle } from "./settlement.js";

const ME = "我";

/** 公开快照：仅行程骨架 + 当日站与坐标，不含账单/清单/成员 */
const publicTripSelect = {
  id: true,
  title: true,
  startDate: true,
  endDate: true,
  editVersion: true,
  days: {
    orderBy: { date: "asc" as const },
    select: {
      id: true,
      date: true,
      note: true,
      items: {
        orderBy: { seq: "asc" as const },
        select: {
          id: true,
          dayId: true,
          seq: true,
          customName: true,
          startTime: true,
          durationMin: true,
          note: true,
          ticketPrice: true,
          needBook: true,
          bookAheadDays: true,
          bookUrl: true,
          poi: {
            select: {
              id: true,
              name: true,
              lng: true,
              lat: true,
              city: true,
              category: true,
            },
          },
          legToNext: {
            select: {
              id: true,
              mode: true,
              distanceM: true,
              durationMin: true,
            },
          },
        },
      },
    },
  },
} as const;

/** 分摊里有「我」以外的人 → 共同支出 */
export function isSharedExpense(splits: Array<{ member: string }>): boolean {
  return splits.some((s) => s.member.trim() && s.member !== ME);
}

export async function createOrGetShare(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return null;

  const now = new Date();
  const existing = await prisma.shareLink.findFirst({
    where: {
      tripId,
      canEdit: false,
      kind: "trip",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (existing) {
    return { token: existing.token, expiresAt: existing.expiresAt };
  }

  const token = randomBytes(18).toString("base64url");
  const link = await prisma.shareLink.create({
    data: { tripId, token, canEdit: false, kind: "trip" },
  });
  return { token: link.token, expiresAt: link.expiresAt };
}

/** 仅共同支出的 AA 账单分享（含附图） */
export async function createOrGetAaShare(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return null;

  const now = new Date();
  const existing = await prisma.shareLink.findFirst({
    where: {
      tripId,
      canEdit: false,
      kind: "aa",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (existing) {
    const snap = await buildAaSnapshot(existing.token);
    return {
      token: existing.token,
      expiresAt: existing.expiresAt,
      sharedCount: snap?.expenses.length ?? 0,
    };
  }

  const token = randomBytes(18).toString("base64url");
  const link = await prisma.shareLink.create({
    data: { tripId, token, canEdit: false, kind: "aa" },
  });
  const snap = await buildAaSnapshot(link.token);
  return {
    token: link.token,
    expiresAt: link.expiresAt,
    sharedCount: snap?.expenses.length ?? 0,
  };
}

/** 弱协作：链接 + 编辑密码（同行程复用 token，可改密） */
export async function createOrUpdateEditShare(tripId: string, password: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return null;
  if (password.length < 4) {
    throw Object.assign(new Error("编辑密码至少 4 位"), { code: 40001 });
  }

  const passwordHash = hashPassword(password);
  const existing = await prisma.shareLink.findFirst({
    where: { tripId, canEdit: true },
  });
  if (existing) {
    await prisma.shareLink.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    return { token: existing.token, expiresAt: existing.expiresAt };
  }

  const token = randomBytes(18).toString("base64url");
  const link = await prisma.shareLink.create({
    data: { tripId, token, canEdit: true, kind: "trip", passwordHash },
  });
  return { token: link.token, expiresAt: link.expiresAt };
}

async function buildAaSnapshot(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      trip: {
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          expenses: {
            include: { splits: true },
            orderBy: { date: "desc" },
          },
        },
      },
    },
  });
  if (!link || link.kind !== "aa") return null;
  if (link.expiresAt && link.expiresAt <= new Date()) return null;

  const shared = link.trip.expenses.filter((e) => isSharedExpense(e.splits));
  const expenses = shared.map((e) => {
    const { receiptExt, splits, ...rest } = e;
    return {
      id: rest.id,
      category: rest.category,
      amount: rest.amount,
      payer: rest.payer,
      date: rest.date,
      note: rest.note,
      hasReceipt: !!receiptExt,
      splits: splits.map((s) => ({ member: s.member, ratio: s.ratio })),
    };
  });

  const transfers = settle(
    expenses.map((e) => ({
      amount: e.amount,
      payer: e.payer,
      splits: e.splits,
    })),
  );

  let total = 0;
  let myShare = 0;
  for (const e of expenses) {
    total += e.amount;
    const ratioSum = e.splits.reduce((s, x) => s + x.ratio, 0);
    if (ratioSum <= 0) continue;
    const mine = e.splits.find((s) => s.member === ME)?.ratio ?? 0;
    myShare += (e.amount * mine) / ratioSum;
  }
  total = Math.round(total * 100) / 100;
  myShare = Math.round(myShare * 100) / 100;

  return {
    kind: "aa" as const,
    token: link.token,
    canEdit: false,
    trip: {
      id: link.trip.id,
      title: link.trip.title,
      startDate: link.trip.startDate,
      endDate: link.trip.endDate,
    },
    expenses,
    transfers,
    totalShared: total,
    myShare,
    othersOweMe: Math.round((total - myShare) * 100) / 100,
  };
}

export async function getShareByToken(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: { kind: true, canEdit: true, expiresAt: true, tripId: true },
  });
  if (!link) return null;
  if (link.expiresAt && link.expiresAt <= new Date()) return null;

  if (link.kind === "aa") {
    return buildAaSnapshot(token);
  }

  const full = await prisma.shareLink.findUnique({
    where: { token },
    include: { trip: { select: publicTripSelect } },
  });
  if (!full) return null;

  const { editVersion, ...tripRest } = full.trip;
  return {
    kind: "trip" as const,
    token: full.token,
    canEdit: full.canEdit,
    editVersion,
    trip: tripRest,
  };
}

/** AA 分享页拉取附图：仅允许该链接下的共同支出 */
export async function getAaShareReceipt(token: string, expenseId: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: { kind: true, expiresAt: true, tripId: true },
  });
  if (!link || link.kind !== "aa") return null;
  if (link.expiresAt && link.expiresAt <= new Date()) return null;

  const row = await prisma.expense.findFirst({
    where: { id: expenseId, tripId: link.tripId },
    include: { splits: true },
  });
  if (!row || !row.receiptExt || !isSharedExpense(row.splits)) return null;

  const file = await readReceiptFile(expenseId, row.receiptExt);
  return file;
}

export async function unlockEditShare(token: string, password: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      trip: {
        select: {
          ...publicTripSelect,
          members: true,
        },
      },
    },
  });
  if (!link || !link.canEdit || !link.passwordHash) return null;
  if (link.expiresAt && link.expiresAt <= new Date()) return null;
  if (!verifyPassword(password, link.passwordHash)) {
    throw Object.assign(new Error("编辑密码错误"), { code: 40102 });
  }

  const { editVersion, members, ...tripRest } = link.trip;
  return {
    tripId: link.tripId,
    editVersion,
    members,
    trip: tripRest,
  };
}

export async function listShares(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return null;
  const now = new Date();
  const rows = await prisma.shareLink.findMany({
    where: { tripId },
    orderBy: { id: "asc" },
    select: { token: true, canEdit: true, kind: true, expiresAt: true },
  });
  return rows.map((r) => ({
    token: r.token,
    canEdit: r.canEdit,
    kind: r.kind === "aa" ? ("aa" as const) : ("trip" as const),
    expiresAt: r.expiresAt,
    active: !r.expiresAt || r.expiresAt > now,
    path: `/share/${r.token}`,
  }));
}

/** 立即失效：expiresAt = now；之后 create 会发新 token */
export async function revokeShare(tripId: string, token: string) {
  const row = await prisma.shareLink.findFirst({ where: { tripId, token } });
  if (!row) return null;
  await prisma.shareLink.update({
    where: { id: row.id },
    data: { expiresAt: new Date() },
  });
  return listShares(tripId);
}

/** 自检用：确保行程公开 DTO 不含隐私键 */
export function assertPublicShape(data: unknown): void {
  const s = JSON.stringify(data);
  for (const bad of ["expenses", "checklist", "members", "payer", "splits", "ACCESS_PASSWORD", "passwordHash"]) {
    if (s.includes(`"${bad}"`)) {
      throw new Error(`share snapshot must not expose ${bad}`);
    }
  }
}
