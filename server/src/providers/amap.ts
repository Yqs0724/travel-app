/** 高德 Web 服务；未配置 Key 时抛 50201，业务层捕获后降级 */

const TIMEOUT_MS = 5000;

export type PoiHit = {
  amapId: string;
  name: string;
  lng: number;
  lat: number;
  city?: string;
  category?: string;
  address?: string;
  /** 周边搜索时高德返回的直线距离（米） */
  distanceM?: number;
};

export type RouteResult = {
  distanceM: number;
  durationMin: number;
  cost?: number;
  /** 路径坐标串 [lng, lat][]；无则前端退回直线 */
  polyline?: [number, number][];
};

function webKey() {
  const key = process.env.AMAP_WEB_KEY?.trim();
  if (!key) throw Object.assign(new Error("高德 Web Key 未配置"), { code: 50201 });
  return key;
}

async function amapGet(path: string, params: Record<string, string>) {
  const key = webKey();
  const url = new URL(path);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error("高德服务 HTTP 错误"), { code: 50201 });
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw Object.assign(new Error("高德服务超时"), { code: 50201 });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const poiCache = new Map<string, { at: number; hits: PoiHit[] }>();
const POI_CACHE_MS = 24 * 60 * 60 * 1000;

/** "lng,lat;lng,lat;..." → 坐标数组 */
export function parseAmapPolyline(raw: string): [number, number][] {
  const out: [number, number][] = [];
  for (const pair of raw.split(";")) {
    const [lngS, latS] = pair.split(",");
    const lng = Number(lngS);
    const lat = Number(latS);
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

function polylineFromSteps(steps: Array<{ polyline?: string }> | undefined): [number, number][] {
  if (!steps?.length) return [];
  const out: [number, number][] = [];
  for (const step of steps) {
    if (step.polyline) out.push(...parseAmapPolyline(step.polyline));
  }
  return out;
}

export async function searchPoi(keyword: string, city?: string): Promise<PoiHit[]> {
  const q = keyword.trim();
  if (!q) return [];
  const cacheKey = `${city ?? ""}|${q}`;
  const cached = poiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < POI_CACHE_MS) return cached.hits;

  const data = await amapGet("https://restapi.amap.com/v3/place/text", {
    keywords: q,
    city: city ?? "",
    offset: "8",
    page: "1",
    extensions: "base",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "POI 搜索失败")), { code: 50201 });
  }
  const pois = (data.pois as Array<Record<string, string>> | undefined) ?? [];
  const hits = mapPoiRows(pois);

  poiCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}

const aroundCache = new Map<string, { at: number; hits: PoiHit[] }>();
const AROUND_CACHE_MS = 60 * 60 * 1000;

/** 供自检：把高德 pois 行映射成 PoiHit */
export function mapPoiRows(pois: Array<Record<string, string>>): PoiHit[] {
  return pois
    .map((p) => {
      const [lngS, latS] = (p.location ?? "").split(",");
      const lng = Number(lngS);
      const lat = Number(latS);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const dist = p.distance != null && p.distance !== "" ? Number(p.distance) : NaN;
      return {
        amapId: p.id,
        name: p.name,
        lng,
        lat,
        city: p.cityname || undefined,
        category: p.type?.split(";")[0],
        address: p.address || undefined,
        distanceM: Number.isFinite(dist) ? Math.round(dist) : undefined,
      } satisfies PoiHit;
    })
    .filter((x) => x != null);
}

/** 周边搜索；types / keywords 至少其一 */
export async function searchAround(opts: {
  lng: number;
  lat: number;
  types?: string;
  keywords?: string;
  radius?: number;
}): Promise<PoiHit[]> {
  const types = opts.types?.trim() ?? "";
  const keywords = opts.keywords?.trim() ?? "";
  if (!types && !keywords) {
    throw Object.assign(new Error("types 与 keywords 不能都为空"), { code: 40001 });
  }
  const radius = Math.min(50000, Math.max(1, Math.round(opts.radius ?? 1500)));
  const lng = Number(opts.lng.toFixed(6));
  const lat = Number(opts.lat.toFixed(6));
  const cacheKey = `${lng},${lat}|${types}|${keywords}|${radius}`;
  const cached = aroundCache.get(cacheKey);
  if (cached && Date.now() - cached.at < AROUND_CACHE_MS) return cached.hits;

  const data = await amapGet("https://restapi.amap.com/v3/place/around", {
    location: `${lng},${lat}`,
    radius: String(radius),
    types,
    keywords,
    offset: "15",
    page: "1",
    extensions: "base",
    sortrule: "distance",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "周边搜索失败")), { code: 50201 });
  }
  const pois = (data.pois as Array<Record<string, string>> | undefined) ?? [];
  const hits = mapPoiRows(pois);
  aroundCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}

function modePath(mode: string): string | null {
  switch (mode) {
    case "walk":
      return "https://restapi.amap.com/v3/direction/walking";
    case "drive":
      return "https://restapi.amap.com/v3/direction/driving";
    case "bike":
      return "https://restapi.amap.com/v4/direction/bicycling";
    case "transit":
    case "subway":
      return null; // 走 routeTransit
    default:
      return null;
  }
}

type TransitSeg = {
  walking?: { steps?: Array<{ polyline?: string }> };
  bus?: {
    buslines?: Array<{ name?: string; type?: string; polyline?: string }>;
  };
};

/** 方案里是否含地铁/轨交 */
export function transitHasSubway(transit: { segments?: TransitSeg[] }): boolean {
  for (const seg of transit.segments ?? []) {
    for (const line of seg.bus?.buslines ?? []) {
      const blob = `${line.name ?? ""}${line.type ?? ""}`;
      if (/地铁|轨交|轻轨|subway/i.test(blob)) return true;
    }
  }
  return false;
}

/** 从公交换乘方案抽出折线 */
export function polylineFromTransit(transit: { segments?: TransitSeg[] }): [number, number][] {
  const out: [number, number][] = [];
  for (const seg of transit.segments ?? []) {
    if (seg.walking?.steps) out.push(...polylineFromSteps(seg.walking.steps));
    for (const line of seg.bus?.buslines ?? []) {
      if (line.polyline) out.push(...parseAmapPolyline(line.polyline));
    }
  }
  return out;
}

/** 地铁优先时挑含地铁的最短方案，否则取列表第一条 */
export function pickTransit(
  transits: Array<{
    duration?: string | number;
    distance?: string | number;
    cost?: string | number;
    segments?: TransitSeg[];
  }>,
  preferSubway: boolean,
) {
  if (!transits.length) return null;
  if (!preferSubway) return transits[0]!;
  const withMetro = transits.filter((t) => transitHasSubway(t));
  const pool = withMetro.length ? withMetro : transits;
  return pool.reduce((a, b) => (Number(a.duration ?? 1e12) <= Number(b.duration ?? 1e12) ? a : b));
}

const cityNearCache = new Map<string, { at: number; city: string; citycode: string }>();
const CITY_NEAR_MS = 24 * 60 * 60 * 1000;

async function cityNear(lng: number, lat: number): Promise<{ city: string; citycode: string }> {
  const key = `${lng.toFixed(2)},${lat.toFixed(2)}`;
  const hit = cityNearCache.get(key);
  if (hit && Date.now() - hit.at < CITY_NEAR_MS) return { city: hit.city, citycode: hit.citycode };

  const data = await amapGet("https://restapi.amap.com/v3/geocode/regeo", {
    location: `${lng},${lat}`,
    extensions: "base",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "逆地理失败")), { code: 50201 });
  }
  const comp = (data.regeocode as { addressComponent?: Record<string, string | string[]> } | undefined)
    ?.addressComponent;
  const rawCity = comp?.city || comp?.province || comp?.district || "";
  const city = Array.isArray(rawCity) ? rawCity[0] ?? "" : String(rawCity);
  const rawCode = comp?.citycode || comp?.adcode || "";
  const citycode = Array.isArray(rawCode) ? rawCode[0] ?? "" : String(rawCode);
  if (!city && !citycode) throw Object.assign(new Error("无法解析城市"), { code: 50201 });
  const row = { at: Date.now(), city: city || citycode, citycode: citycode || city };
  cityNearCache.set(key, row);
  return { city: row.city, citycode: row.citycode };
}

/** 高德公交综合规划（含地铁）。subway → 地铁优先；transit → 尽量不乘地铁 */
async function routeTransit(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  preferSubway: boolean,
): Promise<RouteResult> {
  const near = await cityNear(from.lng, from.lat);
  const city = near.city || near.citycode;
  // v3：0 最快捷（常含水/地铁）；5 不乘地铁。地铁优先时再在结果里挑含地铁的方案
  const strategy = preferSubway ? "0" : "5";
  const data = await amapGet("https://restapi.amap.com/v3/direction/transit/integrated", {
    origin: `${from.lng},${from.lat}`,
    destination: `${to.lng},${to.lat}`,
    city,
    strategy,
    extensions: "all",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "公交路径失败")), { code: 50201 });
  }
  const route = data.route as {
    transits?: Array<{
      duration?: string;
      distance?: string;
      cost?: string;
      segments?: TransitSeg[];
    }>;
  };
  const best = pickTransit(route.transits ?? [], preferSubway);
  if (!best) throw Object.assign(new Error("无可用公交/地铁方案"), { code: 50201 });
  const polyline = polylineFromTransit(best);
  const costN = best.cost != null && best.cost !== "" ? Number(best.cost) : NaN;
  return {
    distanceM: Math.round(Number(best.distance ?? 0)),
    durationMin: Math.max(1, Math.round(Number(best.duration ?? 0) / 60)),
    cost: Number.isFinite(costN) ? costN : undefined,
    polyline: polyline.length ? polyline : undefined,
  };
}

export async function routeBetween(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: string,
): Promise<RouteResult> {
  if (mode === "transit" || mode === "subway") {
    try {
      return await routeTransit(from, to, mode === "subway");
    } catch (e) {
      try {
        return await routeBetween(from, to, "drive");
      } catch {
        throw e;
      }
    }
  }

  const path = modePath(mode);
  if (!path) throw Object.assign(new Error("该交通方式不支持路径规划"), { code: 50201 });

  const origin = `${from.lng},${from.lat}`;
  const destination = `${to.lng},${to.lat}`;

  if (path.includes("/v4/")) {
    const data = await amapGet(path, { origin, destination });
    if (Number(data.errcode ?? 0) !== 0 && String(data.status) !== "1") {
      throw Object.assign(new Error(String(data.errmsg ?? data.info ?? "骑行路径失败")), {
        code: 50201,
      });
    }
    const paths =
      (
        data.data as {
          paths?: Array<{
            distance: number;
            duration: number;
            polyline?: string;
            steps?: Array<{ polyline?: string }>;
          }>;
        } | undefined
      )?.paths ?? [];
    const best = paths[0];
    if (!best) throw Object.assign(new Error("无骑行路径"), { code: 50201 });
    const polyline =
      (best.polyline ? parseAmapPolyline(best.polyline) : null) ??
      polylineFromSteps(best.steps);
    return {
      distanceM: Math.round(Number(best.distance)),
      durationMin: Math.max(1, Math.round(Number(best.duration) / 60)),
      polyline: polyline.length ? polyline : undefined,
    };
  }

  const data = await amapGet(path, { origin, destination });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "路径规划失败")), { code: 50201 });
  }
  const route = data.route as {
    paths?: Array<{
      distance: string;
      duration: string;
      tolls?: string;
      polyline?: string;
      steps?: Array<{ polyline?: string }>;
    }>;
  };
  const best = route?.paths?.[0];
  if (!best) throw Object.assign(new Error("无可用路径"), { code: 50201 });
  const polyline =
    (best.polyline ? parseAmapPolyline(best.polyline) : null) ?? polylineFromSteps(best.steps);
  return {
    distanceM: Math.round(Number(best.distance)),
    durationMin: Math.max(1, Math.round(Number(best.duration) / 60)),
    cost: best.tolls != null ? Number(best.tolls) : undefined,
    polyline: polyline.length ? polyline : undefined,
  };
}

export type WeatherCast = {
  date: string; // YYYY-MM-DD
  dayWeather: string;
  nightWeather: string;
  dayTemp: number | null;
  nightTemp: number | null;
};

export type WeatherResult = {
  city: string;
  adcode: string;
  casts: WeatherCast[];
};

async function regeoAdcode(lng: number, lat: number): Promise<{ adcode: string; city: string }> {
  const data = await amapGet("https://restapi.amap.com/v3/geocode/regeo", {
    location: `${lng},${lat}`,
    extensions: "base",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "逆地理失败")), { code: 50201 });
  }
  const comp = (data.regeocode as { addressComponent?: Record<string, string> } | undefined)
    ?.addressComponent;
  const adcode = comp?.adcode;
  if (!adcode) throw Object.assign(new Error("无法解析城市编码"), { code: 50201 });
  const city = comp.city || comp.province || comp.district || "";
  return { adcode, city: Array.isArray(city) ? "" : city };
}

const weatherCache = new Map<string, { at: number; data: WeatherResult }>();
const WEATHER_CACHE_MS = 60 * 60 * 1000;

export async function weatherByLocation(lng: number, lat: number): Promise<WeatherResult> {
  const { adcode, city } = await regeoAdcode(lng, lat);
  const cached = weatherCache.get(adcode);
  if (cached && Date.now() - cached.at < WEATHER_CACHE_MS) return cached.data;

  const data = await amapGet("https://restapi.amap.com/v3/weather/weatherInfo", {
    city: adcode,
    extensions: "all",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "天气查询失败")), { code: 50201 });
  }
  const forecasts = (data.forecasts as Array<Record<string, unknown>> | undefined) ?? [];
  const f0 = forecasts[0];
  const rawCasts = (f0?.casts as Array<Record<string, string>> | undefined) ?? [];
  const casts: WeatherCast[] = rawCasts.map((c) => ({
    date: c.date,
    dayWeather: c.dayweather ?? "",
    nightWeather: c.nightweather ?? "",
    dayTemp: c.daytemp != null && c.daytemp !== "" ? Number(c.daytemp) : null,
    nightTemp: c.nighttemp != null && c.nighttemp !== "" ? Number(c.nighttemp) : null,
  }));
  const result: WeatherResult = {
    city: String(f0?.city ?? city),
    adcode: String(f0?.adcode ?? adcode),
    casts,
  };
  weatherCache.set(adcode, { at: Date.now(), data: result });
  return result;
}

export type TrafficOverview = {
  status: number; // 1畅通 2缓行 3拥堵 4严重拥堵
  description: string;
  expedite?: string;
  congested?: string;
};

function parseTrafficEvaluation(data: Record<string, unknown>): TrafficOverview {
  const evaluation = data.trafficinfo as
    | { description?: string; evaluation?: Record<string, string> }
    | undefined;
  const ev = evaluation?.evaluation ?? {};
  const status = Number(ev.status ?? data.status ?? 0);
  return {
    status: Number.isFinite(status) ? status : 0,
    description: String(evaluation?.description ?? ev.description ?? "暂无路况描述"),
    expedite: ev.expedite,
    congested: ev.congested,
  };
}

/** 矩形区域路况；坐标为西南—东北 */
export async function trafficRectangle(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<TrafficOverview> {
  const data = await amapGet("https://restapi.amap.com/v3/traffic/status/rectangle", {
    rectangle: `${minLng},${minLat};${maxLng},${maxLat}`,
    extensions: "base",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "路况查询失败")), { code: 50201 });
  }
  return parseTrafficEvaluation(data);
}

export async function trafficCircle(
  lng: number,
  lat: number,
  radiusM = 5000,
): Promise<TrafficOverview> {
  const data = await amapGet("https://restapi.amap.com/v3/traffic/status/circle", {
    location: `${lng},${lat}`,
    radius: String(radiusM),
    extensions: "base",
  });
  if (String(data.status) !== "1") {
    throw Object.assign(new Error(String(data.info ?? "路况查询失败")), { code: 50201 });
  }
  return parseTrafficEvaluation(data);
}
