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
  const hits: PoiHit[] = pois
    .map((p) => {
      const [lngS, latS] = (p.location ?? "").split(",");
      const lng = Number(lngS);
      const lat = Number(latS);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return {
        amapId: p.id,
        name: p.name,
        lng,
        lat,
        city: p.cityname || undefined,
        category: p.type?.split(";")[0],
        address: p.address || undefined,
      } satisfies PoiHit;
    })
    .filter((x) => x != null);

  poiCache.set(cacheKey, { at: Date.now(), hits });
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
      // 公交需 city，无城市时用驾车估耗时
      return "https://restapi.amap.com/v3/direction/driving";
    default:
      return null;
  }
}

export async function routeBetween(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: string,
): Promise<RouteResult> {
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
