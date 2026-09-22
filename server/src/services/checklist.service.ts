import { prisma } from "../lib/prisma.js";
import * as info from "./info.service.js";
import { buildSuggestions, type SuggestItem } from "./checklist.suggest.js";
import { TEMPLATE_META, templateRows, type TemplateId } from "./checklist.templates.js";

export function listTemplates() {
  return TEMPLATE_META;
}

export async function listItems(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  return prisma.checklistItem.findMany({
    where: { tripId },
    orderBy: [{ purchased: "asc" }, { checked: "asc" }, { id: "asc" }],
  });
}

export async function applyTemplate(tripId: string, templateId: TemplateId) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const rows = templateRows(templateId);
  const existing = await prisma.checklistItem.findMany({
    where: { tripId },
    select: { name: true },
  });
  const have = new Set(existing.map((x) => x.name));
  const fresh = rows.filter((r) => !have.has(r.name));

  if (fresh.length > 0) {
    await prisma.checklistItem.createMany({
      data: fresh.map((r) => ({
        tripId,
        category: r.category,
        name: r.name,
        source: "template",
      })),
    });
  }
  return listItems(tripId);
}

export async function addCustom(tripId: string, name: string, category: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  await prisma.checklistItem.create({
    data: {
      tripId,
      name: name.trim(),
      category: category.trim() || "其他",
      source: "custom",
    },
  });
  return listItems(tripId);
}

export async function patchItem(
  id: string,
  data: { purchased?: boolean; checked?: boolean; name?: string; category?: string },
) {
  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) throw Object.assign(new Error("清单项不存在"), { code: 40003 });
  await prisma.checklistItem.update({
    where: { id },
    data: {
      purchased: data.purchased,
      checked: data.checked,
      name: data.name?.trim(),
      category: data.category?.trim(),
    },
  });
  return listItems(item.tripId);
}

export async function removeItem(id: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) throw Object.assign(new Error("清单项不存在"), { code: 40003 });
  await prisma.checklistItem.delete({ where: { id } });
  return listItems(item.tripId);
}

export async function suggestForTrip(tripId: string): Promise<SuggestItem[]> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      checklist: { select: { name: true } },
      days: {
        include: {
          items: { include: { poi: true, legToNext: true } },
        },
      },
    },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const poiParts: string[] = [];
  const modes: string[] = [];
  for (const d of trip.days) {
    for (const it of d.items) {
      if (it.poi?.name) poiParts.push(it.poi.name);
      if (it.poi?.category) poiParts.push(it.poi.category);
      if (it.customName) poiParts.push(it.customName);
      if (it.legToNext?.mode) modes.push(it.legToNext.mode);
    }
  }

  let weatherBlob = "";
  const temps: number[] = [];
  try {
    const w = await info.getTripWeather(tripId);
    if (w) {
      for (const day of w.days) {
        if (day.summary) weatherBlob += ` ${day.summary}`;
      }
      // summary 形如「晴 28° / 多云 20°」——再从 casts 侧拿温不太方便，简单扫数字
      for (const m of weatherBlob.matchAll(/(-?\d+)\s*°/g)) {
        temps.push(Number(m[1]));
      }
    }
  } catch {
    // 天气失败不阻塞推荐
  }

  return buildSuggestions({
    poiBlob: poiParts.join(" "),
    modes,
    weatherBlob,
    temps,
    existingNames: trip.checklist.map((c) => c.name),
  });
}

export async function applySuggestions(
  tripId: string,
  picks: Array<{ name: string; category?: string }>,
) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const existing = await prisma.checklistItem.findMany({
    where: { tripId },
    select: { name: true },
  });
  const have = new Set(existing.map((x) => x.name));
  const fresh = picks
    .map((p) => ({ name: p.name.trim(), category: (p.category ?? "其他").trim() || "其他" }))
    .filter((p) => p.name && !have.has(p.name));

  if (fresh.length > 0) {
    await prisma.checklistItem.createMany({
      data: fresh.map((r) => ({
        tripId,
        category: r.category,
        name: r.name,
        source: "suggest",
      })),
    });
  }
  return listItems(tripId);
}
