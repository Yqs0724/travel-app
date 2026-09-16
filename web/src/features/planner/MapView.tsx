import { useEffect, useMemo, useRef } from "react";
import { isErr } from "@/api/client";
import {
  fetchRoute,
  itemTitle,
  MODE_LABELS,
  type ItineraryItem,
  type TransportMode,
} from "@/api/planner";

export type MapPoint = { id: string; name: string; lng: number; lat: number };

declare global {
  interface Window {
    AMap?: {
      Map: new (el: HTMLElement, opts: Record<string, unknown>) => AMapMap;
      Marker: new (opts: Record<string, unknown>) => AMapMarker;
      Polyline: new (opts: Record<string, unknown>) => { setMap: (m: AMapMap | null) => void };
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
  setContent?: (html: string) => void;
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
};

/** 各段路线色：纸感色系内区分，避免全是同一条线 */
const LEG_COLORS = ["#C9A494", "#6F584C", "#4A7C8C", "#3D8B6E", "#C47A2C"] as const;

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
/** 交通芯片要更大缩放才出，减少近点糊叠 */
const CHIP_ZOOM = 16;
/** 路段直线距离短于此（米）不画芯片，改在目录/半屏改交通 */
const CHIP_MIN_DIST_M = 500;

function haversineM(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 固定 26×26 锚点盒；showLabel 时站名挂在针下方 */
function pinHtml(n: number, name: string, showLabel: boolean) {
  const label = escapeHtml(shortName(name));
  const labelHtml = showLabel
    ? `<div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);max-width:7.5rem;padding:2px 7px;border-radius:999px;background:rgba(250,247,242,0.94);color:#1A1A1A;font:600 11px/1.3 system-ui,sans-serif;box-shadow:0 1px 3px rgba(111,88,76,0.15);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${label}</div>`
    : "";
  return `<div style="position:relative;width:26px;height:26px;pointer-events:auto;user-select:none">
  <div style="width:26px;height:26px;border-radius:999px;background:#6F584C;color:#fff;font:600 12px/26px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(26,26,26,0.2)">${n}</div>
  ${labelHtml}
</div>`;
}

function legChipHtml(mode: string, durationMin: number | null, color: string) {
  const modeLabel =
    MODE_LABELS[mode as TransportMode] ?? (mode.trim() ? escapeHtml(mode) : "交通");
  const time = durationMin != null && durationMin > 0 ? `${durationMin}′` : "?";
  // 更紧凑，减少盖住编号针
  return `<div style="transform:translate(-50%,-50%);padding:2px 7px;border-radius:999px;background:${color};color:#fff;font:600 10px/1.2 system-ui,sans-serif;box-shadow:0 1px 3px rgba(26,26,26,0.2);white-space:nowrap;user-select:none;cursor:pointer;border:1px solid rgba(250,247,242,0.85);opacity:0.92">${modeLabel} ${time}</div>`;
}

function pointAtRatio(path: [number, number][], ratio: number): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0]!;
  const r = Math.min(1, Math.max(0, ratio));
  const idx = Math.min(path.length - 1, Math.max(0, Math.floor(r * (path.length - 1))));
  return path[idx]!;
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
  if (mode === "walk" || mode === "transit" || mode === "drive" || mode === "bike") return mode;
  return "drive";
}

export function MapView({
  items,
  focusId,
  onSelectPoint,
  onEditLeg,
  showTraffic = false,
  className = "",
}: {
  items: ItineraryItem[];
  focusId?: string | null;
  onSelectPoint?: (id: string) => void;
  /** 点击路线中段交通标签 → 改交通方式 */
  onEditLeg?: (fromItemId: string) => void;
  showTraffic?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const trafficRef = useRef<AMapLayer | null>(null);
  const markersRef = useRef<AMapMarker[]>([]);
  const chipsRef = useRef<AMapMarker[]>([]);
  const labelItemsRef = useRef<ItineraryItem[]>([]);
  const drawGen = useRef(0);
  const key = import.meta.env.VITE_AMAP_JS_KEY as string | undefined;
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined;
  const withPoi = useMemo(
    () => items.filter((i) => i.poi && Number.isFinite(i.poi.lng) && Number.isFinite(i.poi.lat)),
    [items],
  );
  const points = useMemo(() => pointsFromItems(items), [items]);
  const pointsKey = withPoi
    .map(
      (i) =>
        `${i.id}:${i.poi!.lng},${i.poi!.lat}:${i.legToNext?.mode ?? ""}:${i.legToNext?.durationMin ?? ""}`,
    )
    .join("|");
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;
  const onEditLegRef = useRef(onEditLeg);
  onEditLegRef.current = onEditLeg;

  function syncMapChrome() {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom?.() ?? 12;
    const showLabels = z >= LABEL_ZOOM;
    const showChips = z >= CHIP_ZOOM;
    const list = labelItemsRef.current;
    markersRef.current.forEach((m, idx) => {
      const item = list[idx];
      if (!item) return;
      m.setContent?.(pinHtml(idx + 1, itemTitle(item), showLabels));
    });
    chipsRef.current.forEach((c) => {
      c.setMap(showChips ? map : null);
    });
  }
  const syncMapChromeRef = useRef(syncMapChrome);
  syncMapChromeRef.current = syncMapChrome;
  // 稳定引用，避免 zoomend 重复叠加
  const onZoomEnd = useRef(() => {
    syncMapChromeRef.current();
  }).current;

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
        map.clearMap();
        markersRef.current = [];
        chipsRef.current = [];

        if (withPoi.length === 0) {
          labelItemsRef.current = [];
          return;
        }

        labelItemsRef.current = withPoi;
        const z0 = map.getZoom?.() ?? 12;
        const showLabels = z0 >= LABEL_ZOOM;
        const showChips = z0 >= CHIP_ZOOM;
        const markers = withPoi.map((item, idx) => {
          const m = new window.AMap!.Marker({
            position: [item.poi!.lng, item.poi!.lat],
            title: itemTitle(item),
            content: pinHtml(idx + 1, itemTitle(item), showLabels),
            offset: new window.AMap!.Pixel(-13, -13),
            zIndex: 200,
          });
          m.on("click", () => onSelectRef.current?.(item.id));
          return m;
        });
        markersRef.current = markers;
        markers.forEach((m) => m.setMap(map));

        for (let i = 0; i < withPoi.length - 1; i++) {
          if (cancelled || gen !== drawGen.current) return;
          const a = withPoi[i]!;
          const b = withPoi[i + 1]!;
          const from = { lng: a.poi!.lng, lat: a.poi!.lat };
          const to = { lng: b.poi!.lng, lat: b.poi!.lat };
          let path: [number, number][] = [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ];
          const mode = a.legToNext?.mode;
          if (mode !== "train" && mode !== "flight") {
            const res = await fetchRoute(from, to, routeMode(mode));
            if (!isErr(res) && res.data.polyline && res.data.polyline.length >= 2) {
              path = res.data.polyline;
            }
          }
          path = snapPathEnds(path, from, to);
          if (cancelled || gen !== drawGen.current) return;

          const color = LEG_COLORS[i % LEG_COLORS.length]!;
          const line = new window.AMap.Polyline({
            path,
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.92,
            lineJoin: "round",
            lineCap: "round",
            zIndex: 50 + i,
            showDir: true,
          });
          line.setMap(map);
          // 芯片隐藏时仍可点线改交通
          (line as { on?: (ev: string, cb: () => void) => void }).on?.("click", () =>
            onEditLegRef.current?.(a.id),
          );

          const leg = a.legToNext;
          const segM = haversineM(from, to);
          if (leg && segM >= CHIP_MIN_DIST_M) {
            const pos = pointAtRatio(path, 0.4);
            const at = { lng: pos[0], lat: pos[1] };
            // 贴太近端点就别画，避免盖住编号针
            if (haversineM(at, from) >= 100 && haversineM(at, to) >= 100) {
              const chip = new window.AMap.Marker({
                position: pos,
                content: legChipHtml(leg.mode, leg.durationMin, color),
                offset: new window.AMap!.Pixel(0, 0),
                zIndex: 60 + i,
              });
              chip.on("click", () => onEditLegRef.current?.(a.id));
              chipsRef.current.push(chip);
              if (showChips) chip.setMap(map);
            }
          }
        }

        if (cancelled || gen !== drawGen.current) return;
        map.setFitView(undefined, false, [56, 56, 168, 56]);
        syncMapChromeRef.current();
      } catch {
        // 降级：容器仍在，目录可编辑
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, security, withPoi, pointsKey]);

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
  }, [showTraffic, pointsKey]);

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
      <div className={`flex items-center justify-center bg-surface-2 px-4 text-center text-sm text-ink-muted ${className}`}>
        未配置 VITE_AMAP_JS_KEY，地图不可用；目录仍可编辑。
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="absolute inset-0 bg-surface-2" />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2/80 px-4 text-center text-sm text-ink-muted">
          当天没有带坐标的地点。在目录里添加时可搜索 POI。
        </div>
      )}
    </div>
  );
}
