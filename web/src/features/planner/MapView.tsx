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

/** 固定 26×26 锚点盒，站名绝对定位，圆心对准坐标 */
function pinHtml(n: number, name: string) {
  const label = escapeHtml(shortName(name));
  return `<div style="position:relative;width:26px;height:26px;pointer-events:auto;user-select:none">
  <div style="width:26px;height:26px;border-radius:999px;background:#6F584C;color:#fff;font:600 12px/26px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(26,26,26,0.2)">${n}</div>
  <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);max-width:7.5rem;padding:2px 7px;border-radius:999px;background:rgba(250,247,242,0.94);color:#1A1A1A;font:600 11px/1.3 system-ui,sans-serif;box-shadow:0 1px 3px rgba(111,88,76,0.15);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${label}</div>
</div>`;
}

function legChipHtml(mode: string, durationMin: number | null, color: string) {
  const modeLabel =
    MODE_LABELS[mode as TransportMode] ?? (mode.trim() ? escapeHtml(mode) : "交通");
  const time = durationMin != null && durationMin > 0 ? `${durationMin}分` : "耗时?";
  return `<div style="transform:translate(-50%,-50%);padding:4px 10px;border-radius:999px;background:${color};color:#fff;font:600 11px/1.3 system-ui,sans-serif;box-shadow:0 1px 4px rgba(26,26,26,0.22);white-space:nowrap;user-select:none;cursor:pointer;border:1.5px solid rgba(250,247,242,0.85)">⇄ ${modeLabel} · ${time}</div>`;
}

function midOfPath(path: [number, number][]): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0]!;
  return path[Math.floor(path.length / 2)]!;
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
        }
        const map = mapRef.current;
        map.resize?.();
        map.clearMap();

        if (withPoi.length === 0) return;

        const markers = withPoi.map((item, idx) => {
          const m = new window.AMap!.Marker({
            position: [item.poi!.lng, item.poi!.lat],
            title: itemTitle(item),
            content: pinHtml(idx + 1, itemTitle(item)),
            offset: new window.AMap!.Pixel(-13, -13),
            zIndex: 120,
          });
          m.on("click", () => onSelectRef.current?.(item.id));
          return m;
        });
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

          const leg = a.legToNext;
          if (leg) {
            const chip = new window.AMap.Marker({
              position: midOfPath(path),
              content: legChipHtml(leg.mode, leg.durationMin, color),
              offset: new window.AMap!.Pixel(0, 0),
              zIndex: 90 + i,
            });
            chip.on("click", () => onEditLegRef.current?.(a.id));
            chip.setMap(map);
          }
        }

        if (cancelled || gen !== drawGen.current) return;
        map.setFitView(undefined, false, [56, 56, 168, 56]);
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
    if (z != null && z < 14) mapRef.current.setZoom(14);
  }, [focusId, points]);

  useEffect(() => {
    return () => {
      if (mapRef.current && trafficRef.current) {
        mapRef.current.remove?.(trafficRef.current);
      }
      trafficRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

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
