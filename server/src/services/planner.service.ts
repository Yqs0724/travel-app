import { prisma } from "../lib/prisma.js";
import * as amap from "../providers/amap.js";
import * as budget from "./budget.service.js";

export const dayInclude = {
  items: {
    orderBy: { seq: "asc" as const },
    include: { poi: true, legToNext: true },
  },
};

const MODES = new Set(["walk", "transit", "drive", "bike", "train", "flight"]);

export function assertMode(mode: string) {
  if (!MODES.has(mode)) {
    throw Object.assign(new Error("交通方式无效"), { code: 40001 });
  }
}

export async function getDay(dayId: string) {
  return prisma.tripDay.findUnique({
    where: { id: dayId },
    include: dayInclude,
  });
}

export async function tripIdForDay(dayId: string) {
  const d = await prisma.tripDay.findUnique({ where: { id: dayId }, select: { tripId: true } });
  return d?.tripId ?? null;
}

export async function tripIdForItem(itemId: string) {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    select: { day: { select: { tripId: true } } },
  });
  return item?.day.tripId ?? null;
}

/** 弱协作：expectedVersion 命中才 +1；未传则跳过（主人账号） */
export async function bumpEditVersion(tripId: string, expectedVersion?: number) {
  if (expectedVersion == null) return;
  const r = await prisma.trip.updateMany({
    where: { id: tripId, editVersion: expectedVersion },
    data: { editVersion: { increment: 1 } },
  });
  if (r.count === 0) {
    throw Object.assign(new Error("行程已被他人更新，请刷新后重试"), { code: 40901 });
  }
}

export async function attachEditVersion<T extends { tripId?: string | null }>(day: T) {
  if (!day.tripId) return day;
  const t = await prisma.trip.findUnique({
    where: { id: day.tripId },
    select: { editVersion: true },
  });
  return { ...day, editVersion: t?.editVersion ?? 0 };
}

async function loadOrderedItems(dayId: string) {
  return prisma.itineraryItem.findMany({
    where: { dayId },
    orderBy: { seq: "asc" },
    include: { poi: true, legToNext: true },
  });
}

/** 有起点时刻时，按停留 + 交通耗时顺延后续 startTime */
function cascadeTimes(
  items: Array<{
    id: string;
    startTime: string | null;
    durationMin: number | null;
    legToNext: { durationMin: number | null } | null;
  }>,
): Array<{ id: string; startTime: string }> {
  if (items.length === 0 || !items[0]?.startTime) return [];
  const updates: Array<{ id: string; startTime: string }> = [];
  let cursor = parseHm(items[0].startTime);
  if (cursor == null) return [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (i > 0) {
      const hm = formatHm(cursor);
      if (item.startTime !== hm) updates.push({ id: item.id, startTime: hm });
    }
    cursor += item.durationMin ?? 60;
    cursor += item.legToNext?.durationMin ?? 0;
  }
  return updates;
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatHm(totalMin: number): string {
  const normalized = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Point = { lng: number; lat: number } | null;

function itemPoint(item: {
  poi: { lng: number; lat: number } | null;
}): Point {
  if (!item.poi) return null;
  return { lng: item.poi.lng, lat: item.poi.lat };
}

async function upsertLeg(
  fromItemId: string,
  mode: string,
  from: Point,
  to: Point,
) {
  let distanceM: number | null = null;
  let durationMin: number | null = null;
  let cost: number | null = null;

  if (from && to && mode !== "train" && mode !== "flight") {
    try {
      const route = await amap.routeBetween(from, to, mode);
      distanceM = route.distanceM;
      durationMin = route.durationMin;
      cost = route.cost ?? null;
    } catch {
      // 高德不可用时保留 mode，耗时留给手动
    }
  }

  return prisma.transportLeg.upsert({
    where: { fromItemId },
    create: { fromItemId, mode, distanceM, durationMin, cost },
    update: { mode, distanceM, durationMin, cost },
  });
}

/** 按当前顺序重建相邻 leg，并顺延时间，返回整天 */
async function recomputeDay(dayId: string) {
  const items = await loadOrderedItems(dayId);

  for (let i = 0; i < items.length; i++) {
    const cur = items[i]!;
    const next = items[i + 1];
    if (!next) {
      if (cur.legToNext) {
        await prisma.transportLeg.delete({ where: { fromItemId: cur.id } });
      }
      continue;
    }
    const mode = cur.legToNext?.mode ?? "walk";
    await upsertLeg(cur.id, mode, itemPoint(cur), itemPoint(next));
  }

  const refreshed = await loadOrderedItems(dayId);
  const timeUpdates = cascadeTimes(refreshed);
  for (const u of timeUpdates) {
    await prisma.itineraryItem.update({
      where: { id: u.id },
      data: { startTime: u.startTime },
    });
  }

  return getDay(dayId);
}

export type AddItemInput = {
  customName?: string;
  poi?: {
    name: string;
    lng: number;
    lat: number;
    amapId?: string;
    city?: string;
    category?: string;
  };
  startTime?: string;
  durationMin?: number;
  ticketPrice?: number;
  needBook?: boolean;
  bookAheadDays?: number;
  bookUrl?: string;
  note?: string;
  modeToNext?: string;
};

export async function addItem(dayId: string, input: AddItemInput) {
  const day = await prisma.tripDay.findUnique({ where: { id: dayId } });
  if (!day) throw Object.assign(new Error("日程不存在"), { code: 40003 });

  if (!input.customName && !input.poi) {
    throw Object.assign(new Error("需要地点名称或 POI"), { code: 40001 });
  }
  if (input.modeToNext) assertMode(input.modeToNext);

  const max = await prisma.itineraryItem.aggregate({
    where: { dayId },
    _max: { seq: true },
  });
  const seq = (max._max.seq ?? -1) + 1;

  let poiId: string | undefined;
  if (input.poi) {
    if (input.poi.amapId) {
      const existing = await prisma.pOI.findUnique({
        where: { amapId: input.poi.amapId },
      });
      if (existing) {
        poiId = existing.id;
      } else {
        const created = await prisma.pOI.create({
          data: {
            amapId: input.poi.amapId,
            name: input.poi.name,
            lng: input.poi.lng,
            lat: input.poi.lat,
            city: input.poi.city,
            category: input.poi.category,
          },
        });
        poiId = created.id;
      }
    } else {
      const created = await prisma.pOI.create({
        data: {
          name: input.poi.name,
          lng: input.poi.lng,
          lat: input.poi.lat,
          city: input.poi.city,
          category: input.poi.category,
        },
      });
      poiId = created.id;
    }
  }

  await prisma.itineraryItem.create({
    data: {
      dayId,
      seq,
      poiId,
      customName: input.customName,
      startTime: input.startTime,
      durationMin: input.durationMin ?? 60,
      ticketPrice: input.ticketPrice,
      needBook: input.needBook ?? false,
      bookAheadDays: input.bookAheadDays,
      bookUrl: input.bookUrl,
      note: input.note,
    },
  });

  // 前一项到本项的 leg：若前一项已有 leg 则重算；否则等 recomputeDay
  return recomputeDay(dayId);
}

export type UpdateItemInput = {
  customName?: string | null;
  startTime?: string | null;
  durationMin?: number | null;
  ticketPrice?: number | null;
  needBook?: boolean;
  bookAheadDays?: number | null;
  bookUrl?: string | null;
  note?: string | null;
};

export async function updateItem(itemId: string, input: UpdateItemInput) {
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) throw Object.assign(new Error("行程条目不存在"), { code: 40003 });

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      customName: input.customName,
      startTime: input.startTime,
      durationMin: input.durationMin,
      ticketPrice: input.ticketPrice,
      needBook: input.needBook,
      bookAheadDays: input.bookAheadDays,
      bookUrl: input.bookUrl,
      note: input.note,
    },
  });

  return recomputeDay(item.dayId);
}

export async function removeItem(itemId: string) {
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) throw Object.assign(new Error("行程条目不存在"), { code: 40003 });

  const dayId = item.dayId;
  await budget.removeExpensesForItem(itemId);
  await prisma.itineraryItem.delete({ where: { id: itemId } });

  const rest = await prisma.itineraryItem.findMany({
    where: { dayId },
    orderBy: { seq: "asc" },
  });
  for (let i = 0; i < rest.length; i++) {
    if (rest[i]!.seq !== i) {
      await prisma.itineraryItem.update({
        where: { id: rest[i]!.id },
        data: { seq: i },
      });
    }
  }

  return recomputeDay(dayId);
}

export async function reorderItems(dayId: string, orderedIds: string[]) {
  const day = await prisma.tripDay.findUnique({ where: { id: dayId } });
  if (!day) throw Object.assign(new Error("日程不存在"), { code: 40003 });

  const existing = await prisma.itineraryItem.findMany({ where: { dayId } });
  const idSet = new Set(existing.map((i) => i.id));
  if (
    orderedIds.length !== existing.length ||
    orderedIds.some((id) => !idSet.has(id))
  ) {
    throw Object.assign(new Error("排序列表与当日条目不一致"), { code: 40001 });
  }

  await prisma.$transaction(
    orderedIds.map((id, seq) =>
      prisma.itineraryItem.update({ where: { id }, data: { seq } }),
    ),
  );

  return recomputeDay(dayId);
}

export async function updateLeg(itemId: string, mode: string) {
  assertMode(mode);
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    include: { poi: true, legToNext: true },
  });
  if (!item) throw Object.assign(new Error("行程条目不存在"), { code: 40003 });

  const next = await prisma.itineraryItem.findFirst({
    where: { dayId: item.dayId, seq: item.seq + 1 },
    include: { poi: true },
  });
  if (!next) {
    throw Object.assign(new Error("已是当日最后一点，无下一段交通"), {
      code: 40001,
    });
  }

  await upsertLeg(item.id, mode, itemPoint(item), itemPoint(next));
  return recomputeDay(item.dayId);
}
