import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isErr } from "@/api/client";
import {
  addItem,
  itemTitle,
  searchAround,
  searchPoi,
  type ItineraryItem,
  type PoiHit,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";

export type NearbyMode = "food" | "play" | "toilet";

const MODES: { id: NearbyMode; label: string }[] = [
  { id: "food", label: "餐饮" },
  { id: "play", label: "玩乐" },
  { id: "toilet", label: "厕所" },
];

const MODE_QUERY: Record<NearbyMode, { types?: string; keywords?: string; radius: number }> = {
  food: { types: "050000", radius: 1500 },
  play: { types: "080000", radius: 1500 },
  toilet: { keywords: "厕所", radius: 1000 },
};

const NONE = "";

const SELECT_ARROW = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6F584C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
)}")`;

const selectClass =
  "h-11 min-w-0 appearance-none rounded-full bg-surface-2 bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pl-3 pr-9 text-sm text-accent-dark outline-none";

function storageKey(tripId: string) {
  return `triptrace:nearby:${tripId}`;
}

function parseMode(raw: string | null): NearbyMode | null {
  if (raw === "food" || raw === "play" || raw === "toilet") return raw;
  return null;
}

function formatDistance(m?: number) {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function dayLabel(day: TripDay, index: number) {
  const md = day.date.slice(5, 10);
  return `D${index + 1} · ${md}`;
}

type Anchor = { item: ItineraryItem; day: TripDay };

function collectAnchors(trip: TripDetail): Anchor[] {
  const out: Anchor[] = [];
  for (const day of trip.days) {
    for (const item of day.items) {
      if (item.poi && Number.isFinite(item.poi.lng) && Number.isFinite(item.poi.lat)) {
        out.push({ item, day });
      }
    }
  }
  return out;
}

function cityHint(trip: TripDetail, anchors: Anchor[]): string | undefined {
  for (const a of anchors) {
    if (a.item.poi?.city) return a.item.poi.city;
  }
  for (const day of trip.days) {
    for (const item of day.items) {
      if (item.poi?.city) return item.poi.city;
    }
  }
  return undefined;
}

export function NearbyPanel({
  trip,
  onDayChange,
  writeOpts,
}: {
  trip: TripDetail;
  onDayChange: (day: TripDay) => void;
  writeOpts?: WriteOpts;
}) {
  const [params, setParams] = useSearchParams();
  const anchors = useMemo(() => collectAnchors(trip), [trip]);
  const city = useMemo(() => cityHint(trip, anchors), [trip, anchors]);

  const initial = useMemo(() => {
    const fromQueryItem = params.get("itemId");
    const fromQueryMode = parseMode(params.get("mode"));
    let storedItem: string | null | undefined;
    let storedMode: NearbyMode | null = null;
    let storedDay: string | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey(trip.id));
      if (raw) {
        const j = JSON.parse(raw) as { itemId?: string | null; mode?: string; dayId?: string };
        storedItem = j.itemId;
        storedMode = parseMode(j.mode ?? null);
        storedDay = j.dayId ?? null;
      }
    } catch {
      /* ignore */
    }
    // 有 query 才锚定；否则默认不锚定（更自由）
    const itemId =
      fromQueryItem != null && fromQueryItem !== ""
        ? fromQueryItem
        : storedItem === undefined
          ? null
          : storedItem;
    const mode = fromQueryMode || storedMode || "food";
    const dayId = storedDay || trip.days[0]?.id || null;
    return { itemId, mode, dayId };
  }, [params, trip.id, trip.days]);

  const [itemId, setItemId] = useState<string | null>(initial.itemId);
  const [mode, setMode] = useState<NearbyMode>(initial.mode);
  const [dayId, setDayId] = useState<string | null>(initial.dayId);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [hits, setHits] = useState<PoiHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const qItem = params.get("itemId");
    const qMode = parseMode(params.get("mode"));
    if (qItem) {
      setItemId(qItem);
      setSubmitted("");
      setQuery("");
    }
    if (qMode) setMode(qMode);
  }, [params]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey(trip.id),
        JSON.stringify({ itemId, mode, dayId }),
      );
    } catch {
      /* ignore */
    }
  }, [trip.id, itemId, mode, dayId]);

  const anchor = useMemo(
    () => (itemId ? anchors.find((a) => a.item.id === itemId) ?? null : null),
    [anchors, itemId],
  );

  // 锚点失效时退回自由模式，不强制绑第一个点
  useEffect(() => {
    if (itemId && !anchor) setItemId(null);
  }, [itemId, anchor]);

  // 有锚点时，加入目标日跟随锚点所在天
  useEffect(() => {
    if (anchor) setDayId(anchor.day.id);
  }, [anchor]);

  const targetDay = useMemo(
    () => trip.days.find((d) => d.id === dayId) ?? trip.days[0] ?? null,
    [trip.days, dayId],
  );

  const load = useCallback(async () => {
    const kw = submitted.trim();
    setBusy(true);
    setError(null);
    setHint(null);

    // 自定义关键词
    if (kw) {
      if (anchor?.item.poi) {
        const res = await searchAround({
          lng: anchor.item.poi.lng,
          lat: anchor.item.poi.lat,
          keywords: kw,
          radius: 3000,
        });
        setBusy(false);
        if (isErr(res)) {
          setError(res.message);
          setHint("已切换手动模式：可到「行程」里手动添加地点");
          setHits([]);
          return;
        }
        setHits(res.data);
        if (res.data.length === 0) setHint("附近没有匹配结果，可换词或去掉锚点做全市搜索");
        return;
      }
      const res = await searchPoi(kw, city);
      setBusy(false);
      if (isErr(res)) {
        setError(res.message);
        setHint("已切换手动模式：可到「行程」里手动添加地点");
        setHits([]);
        return;
      }
      setHits(res.data);
      if (res.data.length === 0) setHint("没搜到，换个关键词试试");
      return;
    }

    // 无关键词：仅锚定后按芯片推荐
    if (!anchor?.item.poi) {
      setBusy(false);
      setHits([]);
      setHint(null);
      return;
    }

    const q = MODE_QUERY[mode];
    const res = await searchAround({
      lng: anchor.item.poi.lng,
      lat: anchor.item.poi.lat,
      types: q.types,
      keywords: q.keywords,
      radius: q.radius,
    });
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      setHint("已切换手动模式：可到「行程」里手动添加地点");
      setHits([]);
      return;
    }
    setHits(res.data);
    if (res.data.length === 0) {
      setHint(mode === "toilet" ? "附近暂无厕所数据（以高德为准，景区内可能不全）" : "附近暂无结果");
    }
  }, [submitted, anchor, mode, city]);

  useEffect(() => {
    void load();
  }, [load]);

  function syncParams(nextItem: string | null, nextMode: NearbyMode) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextItem) next.set("itemId", nextItem);
        else next.delete("itemId");
        next.set("mode", nextMode);
        return next;
      },
      { replace: true },
    );
  }

  function onPickAnchor(id: string) {
    const next = id === NONE ? null : id;
    setItemId(next);
    if (next) {
      setSubmitted("");
      setQuery("");
    }
    syncParams(next, mode);
  }

  function onPickMode(m: NearbyMode) {
    setMode(m);
    setSubmitted("");
    setQuery("");
    syncParams(itemId, m);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setSubmitted(query.trim());
  }

  function onClearSearch() {
    setQuery("");
    setSubmitted("");
  }

  async function onAdd(hit: PoiHit) {
    if (!targetDay) {
      setError("请先选择要加入的行程日");
      return;
    }
    setAddingId(hit.amapId);
    const res = await addItem(
      targetDay.id,
      {
        poi: {
          name: hit.name,
          lng: hit.lng,
          lat: hit.lat,
          amapId: hit.amapId,
          city: hit.city,
          category: hit.category,
        },
      },
      writeOpts,
    );
    setAddingId(null);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setError(null);
    onDayChange(res.data);
  }

  const chipEnabled = Boolean(anchor) && !submitted.trim();
  const status = error || (busy ? "搜索中…" : hint);

  return (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-4 desk-read">
      {/* 搜 + 中心 + 日：两行收口 */}
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none"
          placeholder={anchor ? "附近搜：火锅、咖啡…" : "搜：火锅、商场…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="h-11 shrink-0 rounded-full bg-accent-dark px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          搜
        </button>
      </form>

      <div className="flex gap-2">
        <select
          aria-label="中心点"
          className={`${selectClass} flex-[1.4]`}
          style={{ backgroundImage: SELECT_ARROW }}
          value={itemId ?? NONE}
          onChange={(e) => onPickAnchor(e.target.value)}
        >
          <option value={NONE}>未选择</option>
          {anchors.map((a) => (
            <option key={a.item.id} value={a.item.id}>
              {itemTitle(a.item)}
            </option>
          ))}
        </select>
        <select
          aria-label="加入哪一天"
          className={`${selectClass} flex-1 disabled:opacity-60`}
          style={{ backgroundImage: SELECT_ARROW }}
          value={targetDay?.id ?? ""}
          onChange={(e) => setDayId(e.target.value)}
          disabled={Boolean(anchor)}
        >
          {trip.days.map((d, i) => (
            <option key={d.id} value={d.id}>
              {dayLabel(d, i)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!chipEnabled}
              onClick={() => onPickMode(m.id)}
              className={`h-8 rounded-full px-3 text-sm disabled:opacity-40 ${
                chipEnabled && mode === m.id
                  ? "bg-accent text-accent-dark"
                  : "bg-surface-2 text-accent-dark"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {submitted ? (
          <button type="button" className="shrink-0 text-xs text-accent-dark" onClick={onClearSearch}>
            清除
          </button>
        ) : null}
      </div>

      {status ? (
        <p className={`text-xs ${error ? "text-danger" : "text-ink-muted"}`}>{status}</p>
      ) : null}

      <ul className="space-y-2">
        {hits.map((h) => (
          <li
            key={h.amapId}
            className="flex items-center gap-2 rounded-[20px] border border-line bg-bg px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{h.name}</p>
              <p className="truncate text-xs text-ink-muted">
                {[formatDistance(h.distanceM), h.address || h.city].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 shrink-0 px-3 text-sm"
              disabled={addingId === h.amapId || !targetDay}
              onClick={() => void onAdd(h)}
            >
              {addingId === h.amapId ? "…" : "加入"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
