import type { ItineraryItem, PoiHit } from "@/api/planner";

/** 本行程已带坐标的地点，按 amapId/id 去重（每天复用酒店） */
export function tripPoiHits(days: { items: ItineraryItem[] }[]): PoiHit[] {
  const seen = new Set<string>();
  const out: PoiHit[] = [];
  for (const d of days) {
    for (const it of d.items) {
      const p = it.poi;
      if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
      const key = p.amapId || p.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        amapId: p.amapId || p.id,
        name: p.name,
        lng: p.lng,
        lat: p.lat,
        city: p.city ?? undefined,
        category: p.category ?? undefined,
      });
    }
  }
  return out;
}
