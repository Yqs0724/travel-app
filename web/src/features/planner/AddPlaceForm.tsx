import { FormEvent, useState } from "react";
import { addItem, searchPoi, type PoiHit, type TripDay, type WriteOpts } from "@/api/planner";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";

export function AddPlaceForm({
  day,
  onDayChange,
  onDone,
  writeOpts,
}: {
  day: TripDay;
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

  async function onSearch() {
    const q = name.trim();
    if (!q) return;
    setSearching(true);
    const res = await searchPoi(q, undefined, writeOpts);
    setSearching(false);
    if (isErr(res)) {
      setError(res.message + "（可直接用名称添加）");
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
      <div className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none"
          placeholder="搜索或输入地点名"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(null);
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
                onClick={() => {
                  setPicked(h);
                  setName(h.name);
                  setHits([]);
                }}
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
