import { api, type ApiOpts } from "./client";

export type Poi = {
  id: string;
  amapId: string | null;
  name: string;
  lng: number;
  lat: number;
  city: string | null;
  category: string | null;
};

export type TransportLeg = {
  id: string;
  mode: string;
  distanceM: number | null;
  durationMin: number | null;
  cost: number | null;
};

export type ItineraryItem = {
  id: string;
  dayId: string;
  seq: number;
  poiId: string | null;
  poi: Poi | null;
  customName: string | null;
  startTime: string | null;
  durationMin: number | null;
  ticketPrice: number | null;
  needBook: boolean;
  bookAheadDays: number | null;
  bookUrl: string | null;
  note: string | null;
  legToNext: TransportLeg | null;
};

export type TripDay = {
  id: string;
  tripId?: string;
  date: string;
  note: string | null;
  items: ItineraryItem[];
  editVersion?: number;
};

export type TransportMode = "walk" | "transit" | "drive" | "bike" | "train" | "flight";

export const MODE_LABELS: Record<TransportMode, string> = {
  walk: "步行",
  transit: "公交",
  drive: "驾车",
  bike: "骑行",
  train: "高铁",
  flight: "飞机",
};

export type PoiHit = {
  amapId: string;
  name: string;
  lng: number;
  lat: number;
  city?: string;
  category?: string;
  address?: string;
  distanceM?: number;
};

export type WriteOpts = ApiOpts & { expectedVersion?: number };

function withVersion<T extends Record<string, unknown>>(body: T, opts?: WriteOpts) {
  if (opts?.expectedVersion == null) return body;
  return { ...body, expectedVersion: opts.expectedVersion };
}

export function searchPoi(keyword: string, city?: string, opts?: ApiOpts) {
  const q = new URLSearchParams({ keyword });
  if (city) q.set("city", city);
  return api<PoiHit[]>(`/api/v1/proxy/amap/poi?${q}`, {}, opts);
}

export function searchAround(
  opts: {
    lng: number;
    lat: number;
    types?: string;
    keywords?: string;
    radius?: number;
  },
  apiOpts?: ApiOpts,
) {
  const q = new URLSearchParams({
    lng: String(opts.lng),
    lat: String(opts.lat),
  });
  if (opts.types) q.set("types", opts.types);
  if (opts.keywords) q.set("keywords", opts.keywords);
  if (opts.radius != null) q.set("radius", String(opts.radius));
  return api<PoiHit[]>(`/api/v1/proxy/amap/around?${q}`, {}, apiOpts);
}

export type RouteHit = {
  distanceM: number;
  durationMin: number;
  cost?: number;
  polyline?: [number, number][];
};

export function fetchRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: TransportMode,
  opts?: ApiOpts,
) {
  const q = new URLSearchParams({
    from: `${from.lng},${from.lat}`,
    to: `${to.lng},${to.lat}`,
    mode: mode === "train" || mode === "flight" ? "drive" : mode,
  });
  return api<RouteHit>(`/api/v1/proxy/amap/route?${q}`, {}, opts);
}

export function addItem(
  dayId: string,
  body: {
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
    note?: string;
  },
  opts?: WriteOpts,
) {
  return api<TripDay>(
    `/api/v1/days/${dayId}/items`,
    { method: "POST", body: JSON.stringify(withVersion(body, opts)) },
    opts,
  );
}

export function updateItem(
  id: string,
  body: Partial<{
    customName: string | null;
    startTime: string | null;
    durationMin: number | null;
    note: string | null;
    needBook: boolean;
    bookAheadDays: number | null;
    bookUrl: string | null;
    ticketPrice: number | null;
  }>,
  opts?: WriteOpts,
) {
  return api<TripDay>(
    `/api/v1/items/${id}`,
    { method: "PATCH", body: JSON.stringify(withVersion(body, opts)) },
    opts,
  );
}

export function deleteItem(id: string, opts?: WriteOpts) {
  return api<TripDay>(
    `/api/v1/items/${id}`,
    {
      method: "DELETE",
      body:
        opts?.expectedVersion != null
          ? JSON.stringify({ expectedVersion: opts.expectedVersion })
          : undefined,
    },
    opts,
  );
}

export function reorderItems(dayId: string, orderedIds: string[], opts?: WriteOpts) {
  return api<TripDay>(
    `/api/v1/days/${dayId}/items/reorder`,
    { method: "PUT", body: JSON.stringify(withVersion({ orderedIds }, opts)) },
    opts,
  );
}

export function updateLeg(itemId: string, mode: TransportMode, opts?: WriteOpts) {
  return api<TripDay>(
    `/api/v1/items/${itemId}/leg`,
    { method: "PATCH", body: JSON.stringify(withVersion({ mode }, opts)) },
    opts,
  );
}

export function itemTitle(item: ItineraryItem) {
  return item.poi?.name || item.customName || "未命名";
}
