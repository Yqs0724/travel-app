import { useEffect, useMemo, useRef, useState } from "react";
import { isErr } from "@/api/client";
import {
  fetchRoute,
  itemTitle,
  formatKm,
  MODE_LABELS,
  type ItineraryItem,
  type TransportMode,
} from "@/api/planner";
import { mapVisible, spanSkipsHidden } from "./mapHide";

export type MapPoint = { id: string; name: string; lng: number; lat: number };

declare global {
  interface Window {
    AMap?: {
      Map: new (el: HTMLElement, opts: Record<string, unknown>) => AMapMap;
      Marker: new (opts: Record<string, unknown>) => AMapMarker;
      Polyline: new (opts: Record<string, unknown>) => { setMap: (m: AMapMap | null) => void };
      Polygon?: new (opts: Record<string, unknown>) => { setMap: (m: AMapMap | null) => void };
      Pixel: new (x: number, y: number) => unknown;
      plugin: (name: string | string[], cb: () => void) => void;
      TileLayer?: {
        Traffic: new (opts?: Record<string, unknown>) => AMapLayer;
      };
    };
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}

type AMapMarker = {
  setMap: (m: AMapMap | null) => void;
  on: (event: string, cb: () => void) => void;
  setContent?: (html: string | HTMLElement) => void;
  getPosition?: () => { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number };
  setPosition?: (p: [number, number]) => void;
};

type AMapLayer = {
  setMap?: (m: AMapMap | null) => void;
};

type AMapMap = {
  destroy: () => void;
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  clearMap: () => void;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  getZoom?: () => number;
  setFeatures?: (f: string[]) => void;
  setMapStyle?: (style: string) => void;
  resize?: () => void;
  add?: (layer: unknown) => void;
  remove?: (layer: unknown) => void;
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  lngLatToContainer?: (p: [number, number]) => { getX?: () => number; getY?: () => number; x?: number; y?: number };
  containerToLngLat?: (p: [number, number]) => { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number };
};

/** 各段路线色：纸感色系内区分，避免全是同一条线。总览里同一天共用一色 */
export const LEG_COLORS = ["#C9A494", "#6F584C", "#4A7C8C", "#3D8B6E", "#C47A2C"] as const;

export function pointsFromItems(items: ItineraryItem[]): MapPoint[] {
  return items
    .filter((i) => i.poi && Number.isFinite(i.poi.lng) && Number.isFinite(i.poi.lat))
    .map((i) => ({
      id: i.id,
      name: itemTitle(i),
      lng: i.poi!.lng,
      lat: i.poi!.lat,
    }));
}

let loadPromise: Promise<void> | null = null;

function loadAmap(key: string, securityCode?: string): Promise<void> {
  if (window.AMap) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (securityCode) {
      window._AMapSecurityConfig = { securityJsCode: securityCode };
    }
    const s = document.createElement("script");
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loadPromise = null;
      reject(new Error("高德 JS API 加载失败"));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

function shortName(name: string, max = 8) {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 放大到该级别才显示站名 */
const LABEL_ZOOM = 15;

/** 固定 26×26 锚点盒；showLabel 时站名挂在针下方 */
function pinHtml(n: number, name: string, showLabel: boolean, color = "#6F584C", picked = false) {
  const label = escapeHtml(shortName(name));
  const rgb = parseInt(color.slice(1), 16);
  const y = (((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114) / 1000;
  const ink = y > 160 ? "#1A1A1A" : "#fff";
  const shadow = picked
    ? "box-shadow:0 0 0 3px #fff,0 0 0 5px #1D4E89"
    : "box-shadow:0 1px 4px rgba(26,26,26,0.2)";
  const labelHtml = showLabel
    ? `<div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);max-width:7.5rem;padding:2px 7px;border-radius:999px;background:rgba(250,247,242,0.94);color:#1A1A1A;font:600 11px/1.3 system-ui,sans-serif;box-shadow:0 1px 3px rgba(111,88,76,0.15);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${label}</div>`
    : "";
  return `<div style="position:relative;width:26px;height:26px;pointer-events:auto;user-select:none">
  <div style="width:26px;height:26px;border-radius:999px;background:${color};color:${ink};font:600 12px/26px system-ui,sans-serif;text-align:center;${shadow}">${n}</div>
  ${labelHtml}
</div>`;
}

let chipTapAt = 0;

function bindTap(el: HTMLElement, onClick: () => void) {
  let last = 0;
  const fire = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    onClick();
  };
  el.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
  el.addEventListener("touchend", fire, { passive: false });
  el.addEventListener("click", fire);
}
function pinNode(
  n: number,
  name: string,
  showLabel: boolean,
  color: string,
  picked: boolean,
  onClick?: () => void,
) {
  const host = document.createElement("div");
  host.innerHTML = pinHtml(n, name, showLabel, color, picked);
  const el = host.firstElementChild as HTMLElement;
  if (onClick) bindTap(el, onClick);
  return el;
}

function legChipNode(
  mode: string,
  durationMin: number | null,
  distanceM: number | null,
  color: string,
  onClick?: () => void,
) {
  const modeLabel =
    MODE_LABELS[mode as TransportMode] ?? (mode.trim() ? mode : "交通");
  const bits = [modeLabel];
  if (durationMin != null && durationMin > 0) bits.push(`${durationMin}分`);
  const km = formatKm(distanceM);
  if (km) bits.push(km);
  const el = document.createElement("div");
  el.textContent = bits.join(" · ");
  const rgb = parseInt(color.slice(1), 16);
  const y = Number.isFinite(rgb)
    ? ((((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114) / 1000)
    : 0;
  const ink = y > 160 ? "#1A1A1A" : "#fff";
  const edge = y > 160 ? "rgba(26,26,26,0.28)" : "rgba(250,247,242,0.85)";
  el.style.cssText =
    `transform:translate(-50%,-50%);padding:2px 7px;border-radius:999px;background:${color};color:${ink};font:600 11px/1.2 system-ui,sans-serif;box-shadow:0 1px 3px rgba(26,26,26,0.2);white-space:nowrap;user-select:none;cursor:${onClick ? "pointer" : "default"};pointer-events:auto;border:1px solid ${edge}`;
  el.dataset.legChip = "1";
  if (onClick) {
    bindTap(el, () => {
      chipTapAt = Date.now();
      onClick();
    });
  }
  return el;
}

function clickOnChip(ev?: { originEvent?: { clientX?: number; clientY?: number } }) {
  if (Date.now() - chipTapAt < 500) return true;
  const x = ev?.originEvent?.clientX;
  const y = ev?.originEvent?.clientY;
  if (typeof x !== "number" || typeof y !== "number") return false;
  const hit = document.elementFromPoint(x, y);
  if (hit instanceof Element && hit.closest("[data-leg-chip]")) return true;
  for (const chip of document.querySelectorAll("[data-leg-chip]")) {
    const r = chip.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

/** 沿折线按长度取点。两点时 0.5 必须是中点，不能落到端点上。 */
function pointAtRatio(path: [number, number][], ratio: number): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0]!;
  const r = Math.min(1, Math.max(0, ratio));
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(d);
    total += d;
  }
  if (total === 0) return path[0]!;
  let left = r * total;
  for (let i = 0; i < lens.length; i++) {
    const d = lens[i]!;
    if (left <= d || i === lens.length - 1) {
      const t = d === 0 ? 0 : Math.min(1, left / d);
      const a = path[i]!;
      const b = path[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= d;
  }
  return path[path.length - 1]!;
}

{
  const mid = pointAtRatio(
    [
      [0, 0],
      [10, 0],
    ],
    0.5,
  );
  if (mid[0] !== 5 || mid[1] !== 0) throw new Error("route label midpoint");
}

/** 折线首尾强制贴 POI，避免路网坐标与标点错位 */
function snapPathEnds(
  path: [number, number][],
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): [number, number][] {
  if (path.length < 2) {
    return [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
  }
  const next = path.slice();
  next[0] = [from.lng, from.lat];
  next[next.length - 1] = [to.lng, to.lat];
  return next;
}

function routeMode(mode: string | undefined): TransportMode {
  if (mode === "walk" || mode === "transit" || mode === "subway" || mode === "drive" || mode === "bike")
    return mode;
  return "drive";
}

type LngLat = { lng: number; lat: number };

const driveCache = new Map<string, { distanceM: number | null; durationMin: number | null }>();

async function driveSpan(from: LngLat, to: LngLat, mode: TransportMode = "drive") {
  const key = `${mode}:${from.lng},${from.lat}>${to.lng},${to.lat}`;
  const hit = driveCache.get(key);
  if (hit) return hit;
  const res = await fetchRoute(from, to, mode === "train" || mode === "flight" ? "drive" : mode);
  const v = isErr(res)
    ? { distanceM: null, durationMin: null }
    : { distanceM: res.data.distanceM, durationMin: res.data.durationMin };
  driveCache.set(key, v);
  return v;
}

export function MapView({
  items = [],
  groups,
  pinNumber,
  showNames = false,
  showDayRoutes = true,
  measureIds = [],
  spanOverrides = {},
  cutSpanKeys = [],
  focusId,
  onSelectPoint,
  onEditLeg,
  onEditSpan,
  onCancelSpan,
  showTraffic = false,
  emptyHint = "当天没有带坐标的地点。在目录里添加时可搜索 POI。",
  className = "",
}: {
  items?: ItineraryItem[];
  /** 传入则按组画线，组与组之间不连。总览用：一天一组 */
  groups?: ItineraryItem[][];
  /** 针上的数字，默认组内序号 */
  pinNumber?: (item: ItineraryItem, index: number, group: number) => number;
  /** 总览缩小后也显示站名 */
  showNames?: boolean;
  /** 总览：画出每一天内部的路线。单日页忽略，总是画 */
  showDayRoutes?: boolean;
  /** 总览：按点击顺序测距。两个一条线，三个起封闭 */
  measureIds?: string[];
  /** 点选测距上改过的交通和用时。ponytail: 只活在这次打开，刷新就没。要记住得单独存。 */
  spanOverrides?: Record<string, { mode: string; durationMin: number | null }>;
  /** 点选测距里被点掉的边，`${fromId}>${toId}` */
  cutSpanKeys?: string[];
  focusId?: string | null;
  onSelectPoint?: (id: string) => void;
  /** 点击路线中段交通标签 → 改交通方式 */
  onEditLeg?: (fromItemId: string) => void;
  /** 点击点选测距的标签 */
  onEditSpan?: (fromId: string, toId: string, mode: string, durationMin: number | null) => void;
  /** 点击点选测距的线（不是标签）→ 取消这条线 */
  onCancelSpan?: (fromId: string, toId: string) => void;
  showTraffic?: boolean;
  emptyHint?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const trafficRef = useRef<AMapLayer | null>(null);
  const markersRef = useRef<AMapMarker[]>([]);
  const chipsRef = useRef<AMapMarker[]>([]);
  const spansRef = useRef<{ chip: AMapMarker; from: LngLat; to: LngLat }[]>([]);
  /** 点选测距的线/标签，可单独清掉，不必整图 clearMap */
  const measureOverlaysRef = useRef<Array<{ setMap: (m: AMapMap | null) => void }>>([]);
  const labelItemsRef = useRef<{ item: ItineraryItem; n: number; color: string }[]>([]);
  const showNamesRef = useRef(showNames);
  showNamesRef.current = showNames;
  const pinNumberRef = useRef(pinNumber);
  pinNumberRef.current = pinNumber;
  const drawGen = useRef(0);
  const measureGen = useRef(0);
  const [geoPaintId, setGeoPaintId] = useState(0);
  const key = import.meta.env.VITE_AMAP_JS_KEY as string | undefined;
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined;
  const segments = useMemo(() => {
    const src = groups ?? [items];
    return src
      .map((g, gi) => ({
        gi,
        source: g,
        items: mapVisible(g),
      }))
      .filter((s) => s.items.length > 0);
  }, [groups, groups ? 0 : items]);
  const points = useMemo(
    () => segments.flatMap((s) => pointsFromItems(s.items)),
    [segments],
  );
  // 几何变化才整图重画。测距选点只改蓝圈/测距线，不要 clearMap，否则异步画到一半被取消会空白
  const geoKey = `${groups ? "g" : "s"}:${showDayRoutes ? 1 : 0}:${segments
    .map((s) =>
      s.items
        .map(
          (i) =>
            `${s.gi}:${i.id}:${i.poi!.lng},${i.poi!.lat}:${i.legToNext?.mode ?? ""}:${i.legToNext?.durationMin ?? ""}:${i.legToNext?.distanceM ?? ""}`,
        )
        .join("|"),
    )
    .join("||")}`;
  const measureKey = `${measureIds.join(",")}|${cutSpanKeys.join(",")}|${Object.entries(spanOverrides)
    .map(([k, v]) => `${k}:${v.mode}:${v.durationMin ?? ""}`)
    .join(";")}`;
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;
  const onEditLegRef = useRef(onEditLeg);
  onEditLegRef.current = onEditLeg;
  const onEditSpanRef = useRef(onEditSpan);
  onEditSpanRef.current = onEditSpan;
  const onCancelSpanRef = useRef(onCancelSpan);
  onCancelSpanRef.current = onCancelSpan;
  const measureIdsRef = useRef(measureIds);
  measureIdsRef.current = measureIds;

  function syncMapChrome() {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom?.() ?? 12;
    const showLabels = showNamesRef.current || z >= LABEL_ZOOM;
    const list = labelItemsRef.current;
    markersRef.current.forEach((m, idx) => {
      const row = list[idx];
      if (!row) return;
      m.setContent?.(
        pinNode(row.n, itemTitle(row.item), showLabels, row.color, measureIdsRef.current.includes(row.item.id), () =>
          onSelectRef.current?.(row.item.id),
        ),
      );
    });
    chipsRef.current.forEach((c) => {
      c.setMap(map);
    });
  }
  const syncMapChromeRef = useRef(syncMapChrome);
  syncMapChromeRef.current = syncMapChrome;
  // 稳定引用，避免 zoomend 重复叠加
  const onZoomEnd = useRef(() => {
    syncMapChromeRef.current();
  }).current;

  function nudgeChipsOffPins(map: AMapMap) {
    if (!map.lngLatToContainer || !map.containerToLngLat) return;
    const px = (lng: number, lat: number) => {
      const p = map.lngLatToContainer!([lng, lat]);
      return { x: p.getX?.() ?? p.x ?? 0, y: p.getY?.() ?? p.y ?? 0 };
    };
    const pins = markersRef.current.flatMap((m) => {
      const p = m.getPosition?.();
      if (!p) return [];
      return [px(p.getLng?.() ?? p.lng ?? 0, p.getLat?.() ?? p.lat ?? 0)];
    });
    const gap = (x: number, y: number) =>
      pins.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
    for (const { chip, from, to } of spansRef.current) {
      const pos = chip.getPosition?.();
      if (!pos) continue;
      const c = px(pos.getLng?.() ?? pos.lng ?? 0, pos.getLat?.() ?? pos.lat ?? 0);
      if (gap(c.x, c.y) > 36) continue;
      const a = px(from.lng, from.lat);
      const b = px(to.lng, to.lat);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ox = -(b.y - a.y) / len;
      const oy = (b.x - a.x) / len;
      const shift = 44;
      const side = [1, -1]
        .map((s) => ({ x: c.x + ox * shift * s, y: c.y + oy * shift * s }))
        .sort((p, q) => gap(q.x, q.y) - gap(p.x, p.y))[0]!;
      const ll = map.containerToLngLat([side.x, side.y]);
      chip.setPosition?.([ll.getLng?.() ?? ll.lng ?? 0, ll.getLat?.() ?? ll.lat ?? 0]);
    }
  }

  useEffect(() => {
    if (!key || !containerRef.current) return;
    const gen = ++drawGen.current;
    let cancelled = false;

    void (async () => {
      try {
        await loadAmap(key, security?.trim() || undefined);
        if (cancelled || gen !== drawGen.current || !containerRef.current || !window.AMap) return;

        if (!mapRef.current) {
          mapRef.current = new window.AMap.Map(containerRef.current, {
            zoom: 12,
            viewMode: "2D",
            mapStyle: "amap://styles/whitesmoke",
            features: ["bg", "road"],
            showLabel: false,
          });
          mapRef.current.setFeatures?.(["bg", "road"]);
          mapRef.current.on?.("zoomend", onZoomEnd);
        }
        const map = mapRef.current;
        map.resize?.();

        const flat = segments.flatMap((s) => s.items);
        if (flat.length === 0) {
          labelItemsRef.current = [];
          map.clearMap();
          markersRef.current = [];
          chipsRef.current = [];
          spansRef.current = [];
          measureOverlaysRef.current = [];
          return;
        }

        map.clearMap();
        markersRef.current = [];
        chipsRef.current = [];
        spansRef.current = [];
        measureOverlaysRef.current = [];

        const numbered = segments.flatMap((s) =>
          s.items.map((item, idx) => ({
            item,
            n: pinNumberRef.current?.(item, idx, s.gi) ?? item.seq + 1,
            color: groups ? LEG_COLORS[s.gi % LEG_COLORS.length]! : "#6F584C",
          })),
        );
        labelItemsRef.current = numbered;
        const z0 = map.getZoom?.() ?? 12;
        const showLabels = showNamesRef.current || z0 >= LABEL_ZOOM;
        const markers = numbered.map(({ item, n, color }) => {
          const m = new window.AMap!.Marker({
            position: [item.poi!.lng, item.poi!.lat],
            title: itemTitle(item),
            content: pinNode(n, itemTitle(item), showLabels, color, measureIdsRef.current.includes(item.id), () =>
              onSelectRef.current?.(item.id),
            ),
            offset: new window.AMap!.Pixel(-13, -13),
            zIndex: 200,
          });
          return m;
        });
        markersRef.current = markers;
        markers.forEach((m) => m.setMap(map));
        // 先对准视野再画路线。16 站串行等路网时若被取消，否则一直停在空白默认视野
        if (!(groups && !showDayRoutes)) {
          map.setFitView(markers, true, [56, 56, 168, 56]);
        }
        syncMapChromeRef.current();

        let lineI = 0;
        const drawDay = !groups || showDayRoutes;
        if (drawDay) {
          type LegJob = {
            a: ItineraryItem;
            b: ItineraryItem;
            skipped: boolean;
            color: string;
            from: { lng: number; lat: number };
            to: { lng: number; lat: number };
            zLine: number;
            zChip: number;
          };
          const jobs: LegJob[] = [];
          for (const seg of segments) {
            const dayColor = LEG_COLORS[seg.gi % LEG_COLORS.length]!;
            for (let i = 0; i < seg.items.length - 1; i++) {
              const a = seg.items[i]!;
              const b = seg.items[i + 1]!;
              jobs.push({
                a,
                b,
                skipped: spanSkipsHidden(seg.source, a.seq, b.seq),
                color: groups ? dayColor : LEG_COLORS[i % LEG_COLORS.length]!,
                from: { lng: a.poi!.lng, lat: a.poi!.lat },
                to: { lng: b.poi!.lng, lat: b.poi!.lat },
                zLine: 50 + lineI,
                zChip: 80 + lineI,
              });
              lineI++;
            }
          }

          const painted = await Promise.all(
            jobs.map(async (job) => {
              let path: [number, number][] = [
                [job.from.lng, job.from.lat],
                [job.to.lng, job.to.lat],
              ];
              const mode = job.skipped ? "drive" : job.a.legToNext?.mode;
              let fetched: { durationMin: number; distanceM: number } | null = null;
              if (mode !== "train" && mode !== "flight") {
                const res = await fetchRoute(job.from, job.to, routeMode(mode));
                if (!isErr(res) && res.data.polyline && res.data.polyline.length >= 2) {
                  path = res.data.polyline;
                  fetched = { durationMin: res.data.durationMin, distanceM: res.data.distanceM };
                }
              }
              return { job, path: snapPathEnds(path, job.from, job.to), fetched };
            }),
          );
          if (cancelled || gen !== drawGen.current) return;

          for (const { job, path, fetched } of painted) {
            const line = new window.AMap.Polyline({
              path,
              strokeColor: job.color,
              strokeWeight: 5,
              strokeOpacity: 0.92,
              lineJoin: "round",
              lineCap: "round",
              zIndex: job.zLine,
              showDir: true,
              cursor: job.skipped ? "default" : "pointer",
            });
            line.setMap(map);
            if (!job.skipped) {
              (line as { on?: (ev: string, cb: () => void) => void }).on?.("click", () =>
                onEditLegRef.current?.(job.a.id),
              );
            }

            const leg = job.skipped ? null : job.a.legToNext;
            const chipLeg = leg
              ? { mode: leg.mode, durationMin: leg.durationMin, distanceM: leg.distanceM }
              : fetched
                ? { mode: "drive", durationMin: fetched.durationMin, distanceM: fetched.distanceM }
                : null;
            if (chipLeg) {
              const chip = new window.AMap.Marker({
                position: pointAtRatio(path, 0.5),
                content: legChipNode(
                  chipLeg.mode,
                  chipLeg.durationMin,
                  chipLeg.distanceM,
                  job.color,
                  job.skipped ? undefined : () => onEditLegRef.current?.(job.a.id),
                ),
                offset: new window.AMap!.Pixel(0, 0),
                zIndex: job.zChip,
                bubble: false,
              });
              chip.on("click", () => {
                if (!job.skipped) onEditLegRef.current?.(job.a.id);
              });
              chipsRef.current.push(chip);
              chip.setMap(map);
            }
          }
        }

        if (cancelled || gen !== drawGen.current) return;
        if (!(groups && !showDayRoutes)) {
          map.setFitView(undefined, true, [56, 56, 168, 56]);
        }
        nudgeChipsOffPins(map);
        syncMapChromeRef.current();
        setGeoPaintId((n) => n + 1);
      } catch {
        // 降级：容器仍在，目录可编辑
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, security, geoKey]);

  useEffect(() => {
    syncMapChromeRef.current();
  }, [measureIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.AMap || !groups || showDayRoutes) {
      for (const o of measureOverlaysRef.current) o.setMap(null);
      measureOverlaysRef.current = [];
      spansRef.current = [];
      return;
    }
    let cancelled = false;
    const gen = ++measureGen.current;

    for (const o of measureOverlaysRef.current) o.setMap(null);
    measureOverlaysRef.current = [];
    spansRef.current = [];

    const flat = segments.flatMap((s) => s.items);
    if (flat.length === 0 || measureIds.length < 2) {
      syncMapChromeRef.current();
      return;
    }

    void (async () => {
      async function paintSpan(
        from: LngLat,
        to: LngLat,
        color: string,
        z: number,
        edit?: { fromId: string; toId: string; mode: string; durationMin?: number | null },
      ) {
        const mode = routeMode(edit?.mode);
        const span = await driveSpan(from, to, mode);
        if (cancelled || gen !== measureGen.current) return;
        const duration = edit?.durationMin !== undefined ? edit.durationMin : span.durationMin;
        const path: [number, number][] = [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ];
        const cancel =
          edit &&
          ((ev?: { originEvent?: { clientX?: number; clientY?: number } }) => {
            if (clickOnChip(ev)) return;
            onCancelSpanRef.current?.(edit.fromId, edit.toId);
          });
        const hit = new window.AMap!.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 22,
          strokeOpacity: 0,
          zIndex: z + 1,
          cursor: cancel ? "pointer" : "default",
          bubble: false,
        });
        (hit as { on?: (ev: string, cb: (e?: { originEvent?: { clientX?: number; clientY?: number } }) => void) => void }).on?.(
          "click",
          (ev) => cancel && cancel(ev),
        );
        hit.setMap(map);
        measureOverlaysRef.current.push(hit);
        const line = new window.AMap!.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 1,
          isOutline: true,
          outlineColor: "#6F584C",
          borderWeight: 1,
          lineJoin: "round",
          lineCap: "round",
          zIndex: z,
          cursor: cancel ? "pointer" : "default",
          bubble: false,
        });
        line.setMap(map);
        measureOverlaysRef.current.push(line);
        const chip = new window.AMap!.Marker({
          position: pointAtRatio(path, 0.5),
          content: legChipNode(edit?.mode || "drive", duration, span.distanceM, color, () =>
            edit ? onEditSpanRef.current?.(edit.fromId, edit.toId, edit.mode || "drive", duration) : undefined,
          ),
          offset: new window.AMap!.Pixel(0, 0),
          zIndex: z + 15,
          bubble: false,
        });
        spansRef.current.push({ chip, from, to });
        measureOverlaysRef.current.push(chip);
        chip.setMap(map);
      }

      const byId = new Map(flat.map((item) => [item.id, item]));
      const picked = measureIds.map((id) => byId.get(id)).filter((item) => item?.poi);
      const n = picked.length >= 3 ? picked.length : picked.length === 2 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        if (cancelled || gen !== measureGen.current) return;
        const a = picked[i]!;
        const b = picked[(i + 1) % picked.length]!;
        const edge = `${a.id}>${b.id}`;
        if (cutSpanKeys.includes(edge)) continue;
        const ov = spanOverrides[edge];
        await paintSpan(
          { lng: a.poi!.lng, lat: a.poi!.lat },
          { lng: b.poi!.lng, lat: b.poi!.lat },
          "#FFFFFF",
          60,
          { fromId: a.id, toId: b.id, mode: ov?.mode || "drive", durationMin: ov?.durationMin },
        );
      }
      if (cancelled || gen !== measureGen.current) return;
      nudgeChipsOffPins(map);
      syncMapChromeRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [measureKey, geoPaintId, groups, showDayRoutes]);

  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const m = mapRef.current;
      if (!m) return;
      m.resize?.();
    });
    ro.observe(el);
    map?.resize?.();
    return () => ro.disconnect();
  }, [key, geoKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.AMap?.TileLayer?.Traffic) return;

    if (showTraffic) {
      if (!trafficRef.current) {
        trafficRef.current = new window.AMap.TileLayer.Traffic({
          zIndex: 10,
          zooms: [7, 22],
        });
      }
      map.add?.(trafficRef.current);
    } else if (trafficRef.current) {
      map.remove?.(trafficRef.current);
    }
  }, [showTraffic, geoKey]);

  useEffect(() => {
    if (!focusId || !mapRef.current || points.length === 0) return;
    const p = points.find((x) => x.id === focusId);
    if (!p) return;
    mapRef.current.setCenter([p.lng, p.lat]);
    const z = mapRef.current.getZoom?.();
    // 飞点时至少放到能显示站名的级别
    if (z == null || z < LABEL_ZOOM) {
      mapRef.current.setZoom(LABEL_ZOOM);
      syncMapChromeRef.current();
    }
  }, [focusId, points]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.off?.("zoomend", onZoomEnd);
        if (trafficRef.current) mapRef.current.remove?.(trafficRef.current);
      }
      trafficRef.current = null;
      markersRef.current = [];
      chipsRef.current = [];
      labelItemsRef.current = [];
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [onZoomEnd]);

  if (!key) {
    return (
      <div className={`flex items-center justify-center bg-surface-2 px-4 text-center text-sm text-ink-muted touch-none ${className}`} data-map>
        未配置 VITE_AMAP_JS_KEY，地图不可用；目录仍可编辑。
      </div>
    );
  }

  return (
    <div className={`relative touch-none ${className}`} data-map>
      <div ref={containerRef} className="absolute inset-0 bg-surface-2" />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2/80 px-4 text-center text-sm text-ink-muted">
          {emptyHint}
        </div>
      )}
    </div>
  );
}
