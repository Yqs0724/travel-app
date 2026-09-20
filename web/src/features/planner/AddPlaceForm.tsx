import { FormEvent, useMemo, useState } from "react";
import {
  addItem,
  searchPoi,
  type ItineraryItem,
  type PoiHit,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";
import { tripPoiHits } from "./tripPois";

export function AddPlaceForm({
  day,
  tripDays,
  onDayChange,
  onDone,
  writeOpts,
}: {
  day: TripDay;
  /** 整趟行程，用于「本行程地点」复用酒店等 */
  tripDays?: { items: ItineraryItem[] }[];
  onDayChange: (day: TripDay) => void;
  onDone?: () => void;
  writeOpts?: WriteOpts;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PoiHit | null>(null);
  const [hits, setHits] = useState<PoiHit[]>([]);
  const [searching, setSearching] = useState(false);

  const reused = useMemo(() => tripPoiHits(tripDays ?? []), [tripDays]);
  const q = name.trim().toLowerCase();
  const reusedShown = q
    ? reused.filter((h) => h.name.toLowerCase().includes(q))
    : reused;

  function pick(h: PoiHit) {
    setPicked(h);
    setName(h.name);
    setHits([]);
    setError(null);
  }

  async function onSearch() {
    const query = name.trim();
    if (!query) return;
    setSearching(true);
    const res = await searchPoi(query, undefined, writeOpts);
    setSearching(false);
    if (isErr(res)) {
      setError(res.message + "（可从上方本行程地点选，或直接用名称添加）");
      setHits([]);
      return;
    }
    setError(null);
    setHits(res.data);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await addItem(
      day.id,
      {
        ...(picked
          ? {
              poi: {
                name: picked.name,
                lng: picked.lng,
                lat: picked.lat,
                amapId: picked.amapId,
                city: picked.city,
                category: picked.category,
              },
            }
          : { customName: name.trim() }),
      },
      writeOpts,
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setError(null);
    onDayChange(res.data);
    setName("");
    setPicked(null);
    setHits([]);
    onDone?.();
  }

  return (
    <form onSubmit={(e) => void onAdd(e)} className="space-y-3 rounded-btn border border-line bg-bg/80 p-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      {reusedShown.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-ink-muted">本行程地点（含坐标）</p>
          <ul className="max-h-28 overflow-y-auto rounded-btn border border-line scroll-warm">
            {reusedShown.map((h) => (
              <li key={h.amapId}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => pick(h)}
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none"
          placeholder="搜索或输入地点名"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(null);
          }}
          onKeyDown={(e) => {
            // Enter 默认搜 POI，避免无坐标 customName 上地图空白
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!searching && !busy && name.trim()) void onSearch();
          }}
          required={!picked}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy || searching || !name.trim()}
          onClick={() => void onSearch()}
        >
          {searching ? "…" : "搜索"}
        </Button>
      </div>
      {picked && (
        <p className="text-xs text-ok">
          已选：{picked.name}
          {picked.address ? ` · ${picked.address}` : ""}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-btn border border-line scroll-warm">
          {hits.map((h) => (
            <li key={h.amapId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => pick(h)}
              >
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-ink-muted">{h.address ?? h.city ?? ""}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || (!picked && !name.trim())}>
          添加
        </Button>
        {onDone && (
          <Button type="button" variant="secondary" onClick={onDone}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
