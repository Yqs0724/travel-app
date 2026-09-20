import { prisma } from "../lib/prisma.js";
import * as amap from "../providers/amap.js";
import * as budget from "./budget.service.js";
import { touchVersion } from "./live.service.js";

export const dayInclude = {
  items: {
    orderBy: { seq: "asc" as const },
    include: { poi: true, legToNext: true },
  },
};

const MODES = new Set(["walk", "transit", "subway", "drive", "bike", "train", "flight"]);

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

/** 任意写操作 +1；传 expectedVersion 时做乐观锁（协作/多人在线） */
export async function bumpEditVersion(tripId: string, expectedVersion?: number) {
  if (expectedVersion != null) {
    const r = await prisma.trip.updateMany({
      where: { id: tripId, editVersion: expectedVersion },
      data: { editVersion: { increment: 1 } },
    });
    if (r.count === 0) {
      throw Object.assign(new Error("行程已被他人更新，请刷新后重试"), { code: 40901 });
    }
  } else {
    await prisma.trip.update({
      where: { id: tripId },
      data: { editVersion: { increment: 1 } },
    });
  }
  const t = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { editVersion: true },
  });
  const v = t?.editVersion ?? 0;
  touchVersion(tripId, v);
  return v;
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
  durationOverride?: number,
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
  if (durationOverride != null) durationMin = durationOverride;

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
    const mode = cur.legToNext?.mode ?? "drive";
    // ponytail: 手改的用时在重排时保住。要让改点位后自动重算用时，得加 manual 标记，没标记才覆盖。
    await upsertLeg(
      cur.id,
      mode,
      itemPoint(cur),
      itemPoint(next),
      cur.legToNext?.durationMin ?? undefined,
    );
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

export type PoiInput = {
  name: string;
  lng: number;
  lat: number;
  amapId?: string;
  city?: string;
  category?: string;
};

/** 写入/复用 POI 行，返回 id */
export async function ensurePoiId(poi: PoiInput): Promise<string> {
  if (poi.amapId) {
    const existing = await prisma.pOI.findUnique({ where: { amapId: poi.amapId } });
    if (existing) return existing.id;
    const created = await prisma.pOI.create({
      data: {
        amapId: poi.amapId,
        name: poi.name,
        lng: poi.lng,
        lat: poi.lat,
        city: poi.city,
        category: poi.category,
      },
    });
    return created.id;
  }
  const created = await prisma.pOI.create({
    data: {
      name: poi.name,
      lng: poi.lng,
      lat: poi.lat,
      city: poi.city,
      category: poi.category,
    },
  });
  return created.id;
}

/** 本行程已用过的同名 POI（每天加酒店不用重新搜） */
export async function findTripPoiIdByName(tripId: string, name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const hit = await prisma.itineraryItem.findFirst({
    where: {
      day: { tripId },
      poiId: { not: null },
      poi: { name: n },
    },
    select: { poiId: true },
  });
  return hit?.poiId ?? null;
}

export type AddItemInput = {
  customName?: string;
  poi?: PoiInput;
  startTime?: string;
  durationMin?: number;
  ticketPrice?: number;
  needBook?: boolean;
  bookAheadDays?: number;
  bookRemindAt?: string;
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
  let customName = input.customName;
  if (input.poi) {
    poiId = await ensurePoiId(input.poi);
  } else if (input.customName) {
    const reused = await findTripPoiIdByName(day.tripId, input.customName);
    if (reused) {
      poiId = reused;
      customName = undefined; // 标题走 POI，地图有坐标
    }
  }

  await prisma.itineraryItem.create({
    data: {
      dayId,
      seq,
      poiId,
      customName,
      startTime: input.startTime,
      durationMin: input.durationMin ?? 60,
      ticketPrice: input.ticketPrice,
      needBook: input.needBook ?? false,
      bookAheadDays: input.bookAheadDays,
      bookRemindAt: input.bookRemindAt || null,
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
  bookRemindAt?: string | null;
  bookUrl?: string | null;
  note?: string | null;
  mapHidden?: boolean;
  /** 给无坐标点补上 POI（如后天酒店复用第一天） */
  poi?: PoiInput;
};

export async function updateItem(itemId: string, input: UpdateItemInput) {
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) throw Object.assign(new Error("行程条目不存在"), { code: 40003 });

  let poiId: string | undefined;
  let customName = input.customName;
  if (input.poi) {
    poiId = await ensurePoiId(input.poi);
    if (customName === undefined) customName = null;
  }

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      ...(poiId != null ? { poiId } : {}),
      customName,
      startTime: input.startTime,
      durationMin: input.durationMin,
      ticketPrice: input.ticketPrice,
      needBook: input.needBook,
      bookAheadDays: input.bookAheadDays,
      bookRemindAt: input.bookRemindAt,
      bookUrl: input.bookUrl,
      note: input.note,
      mapHidden: input.mapHidden,
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

/** 清空当天全部地点（路段随地点级联删除） */
export async function clearDayItems(dayId: string) {
  const day = await prisma.tripDay.findUnique({ where: { id: dayId }, select: { id: true } });
  if (!day) throw Object.assign(new Error("日程不存在"), { code: 40003 });

  const items = await prisma.itineraryItem.findMany({
    where: { dayId },
    select: { id: true },
  });
  const ids = items.map((i) => i.id);
  if (ids.length) {
    await prisma.expense.deleteMany({ where: { itemId: { in: ids } } });
    await prisma.itineraryItem.deleteMany({ where: { dayId } });
  }
  return getDay(dayId);
}

/** 跨天移动：改 dayId + seq，两端日程都重算 */
export async function moveItemToDay(itemId: string, toDayId: string, toSeq?: number) {
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) throw Object.assign(new Error("行程条目不存在"), { code: 40003 });

  const toDay = await prisma.tripDay.findUnique({ where: { id: toDayId } });
  if (!toDay) throw Object.assign(new Error("目标日程不存在"), { code: 40003 });

  const fromDay = await prisma.tripDay.findUnique({ where: { id: item.dayId } });
  if (!fromDay || fromDay.tripId !== toDay.tripId) {
    throw Object.assign(new Error("不能跨行程移动"), { code: 40001 });
  }

  const fromDayId = item.dayId;
  if (fromDayId === toDayId) {
    const ordered = await prisma.itineraryItem.findMany({
      where: { dayId: toDayId },
      orderBy: { seq: "asc" },
    });
    const ids = ordered.map((x) => x.id);
    const from = ids.indexOf(itemId);
    if (from < 0) throw Object.assign(new Error("条目不在当日"), { code: 40001 });
    ids.splice(from, 1);
    const insertAt =
      toSeq == null ? ids.length : Math.max(0, Math.min(toSeq, ids.length));
    ids.splice(insertAt, 0, itemId);
    return reorderItems(toDayId, ids);
  }

  // detach from source
  await prisma.transportLeg.deleteMany({ where: { fromItemId: itemId } });
  const prevOnFrom = await prisma.itineraryItem.findFirst({
    where: { dayId: fromDayId, seq: item.seq - 1 },
  });
  if (prevOnFrom) {
    await prisma.transportLeg.deleteMany({ where: { fromItemId: prevOnFrom.id } });
  }

  const destCount = await prisma.itineraryItem.count({ where: { dayId: toDayId } });
  const insertAt =
    toSeq == null ? destCount : Math.max(0, Math.min(toSeq, destCount));

  // bump seq on destination
  const destItems = await prisma.itineraryItem.findMany({
    where: { dayId: toDayId },
    orderBy: { seq: "desc" },
  });
  for (const d of destItems) {
    if (d.seq >= insertAt) {
      await prisma.itineraryItem.update({
        where: { id: d.id },
        data: { seq: d.seq + 1 },
      });
    }
  }

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: { dayId: toDayId, seq: insertAt },
  });

  // compact source seq
  const rest = await prisma.itineraryItem.findMany({
    where: { dayId: fromDayId },
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

  await recomputeDay(fromDayId);
  return recomputeDay(toDayId);
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

export async function updateLeg(itemId: string, mode: string, durationMin?: number) {
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

  await upsertLeg(item.id, mode, itemPoint(item), itemPoint(next), durationMin);
  return recomputeDay(item.dayId);
}
