import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MODE_LABELS,
  deleteItem,
  itemTitle,
  reorderItems,
  updateItem,
  updateLeg,
  type ItineraryItem,
  type TransportMode,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";

const MODES = Object.keys(MODE_LABELS) as TransportMode[];

export function ItemEditSheet({
  day,
  item,
  index,
  tripId,
  onDayChange,
  onClose,
  writeOpts,
}: {
  day: TripDay;
  item: ItineraryItem;
  index: number;
  /** 有则显示「周边 / 找厕所」跳转；分享页不传 */
  tripId?: string;
  onDayChange: (day: TripDay) => void;
  onClose: () => void;
  writeOpts?: WriteOpts;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(String(item.durationMin ?? 60));
  const [startTime, setStartTime] = useState(item.startTime ?? "");
  const [needBook, setNeedBook] = useState(item.needBook);
  const [bookAhead, setBookAhead] = useState(String(item.bookAheadDays ?? 3));
  const [bookUrl, setBookUrl] = useState(item.bookUrl ?? "");
  const [ticket, setTicket] = useState(
    item.ticketPrice != null && item.ticketPrice > 0 ? String(item.ticketPrice) : "",
  );

  const hasCoords =
    item.poi != null && Number.isFinite(item.poi.lng) && Number.isFinite(item.poi.lat);

  function goNearby(mode: "food" | "toilet") {
    if (!tripId || !hasCoords) return;
    onClose();
    navigate(`/trips/${tripId}/nearby?itemId=${encodeURIComponent(item.id)}&mode=${mode}`);
  }

  async function apply(res: Awaited<ReturnType<typeof reorderItems>>) {
    if (isErr(res)) {
      setError(res.message);
      return false;
    }
    setError(null);
    onDayChange(res.data);
    return true;
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await apply(
      await updateItem(
        item.id,
        {
          durationMin: duration ? Number(duration) : null,
          startTime: startTime || null,
          needBook,
          bookAheadDays: needBook ? (bookAhead ? Number(bookAhead) : 0) : null,
          bookUrl: needBook ? bookUrl.trim() || null : null,
          ticketPrice: ticket.trim() === "" ? null : Number(ticket),
        },
        writeOpts,
      ),
    );
    setBusy(false);
    if (ok) onClose();
  }

  async function onLeg(mode: TransportMode) {
    if (!item.legToNext) return;
    setBusy(true);
    await apply(await updateLeg(item.id, mode, writeOpts));
    setBusy(false);
  }

  async function onMove(dir: -1 | 1) {
    const ids = day.items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    setBusy(true);
    const ok = await apply(await reorderItems(day.id, next, writeOpts));
    setBusy(false);
    if (ok) onClose();
  }

  async function onDelete() {
    if (!confirm(`删除「${itemTitle(item)}」？`)) return;
    setBusy(true);
    const ok = await apply(await deleteItem(item.id, writeOpts));
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet open onClose={onClose} aria-label="编辑行程点">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{itemTitle(item)}</p>
            <p className="text-xs text-ink-muted tabular-nums">{item.startTime ?? "—"}</p>
          </div>
          <button type="button" className="h-11 w-11 text-lg text-ink-muted" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-danger">{error}</p>}

        <form onSubmit={(e) => void onSave(e)} className="space-y-3">
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-xs text-ink-muted">
              <span className="mb-1 block truncate">时刻</span>
              <input
                type="time"
                className="h-11 w-full rounded-btn bg-surface-2 px-3 text-sm outline-none"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="min-w-0 flex-1 text-xs text-ink-muted">
              <span className="mb-1 block truncate">停留（分）</span>
              <input
                type="number"
                min={0}
                className="h-11 w-full rounded-btn bg-surface-2 px-3 text-sm outline-none"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
            <label className="min-w-0 flex-1 text-xs text-ink-muted">
              <span className="mb-1 block truncate">门票（元）</span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="可选"
                className="h-11 w-full rounded-btn bg-surface-2 px-3 text-sm outline-none"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-ink-muted">门票为参考估价，不进账单</p>

          {tripId ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 text-sm"
                disabled={!hasCoords}
                title={hasCoords ? undefined : "该点无坐标，无法查周边"}
                onClick={() => goNearby("food")}
              >
                周边
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1 text-sm"
                disabled={!hasCoords}
                title={hasCoords ? undefined : "该点无坐标，无法找厕所"}
                onClick={() => goNearby("toilet")}
              >
                找厕所
              </Button>
            </div>
          ) : null}
          {tripId && !hasCoords ? (
            <p className="text-xs text-ink-muted">无地图坐标时不可查周边</p>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={needBook}
              onChange={(e) => setNeedBook(e.target.checked)}
              className="h-4 w-4 accent-accent-dark"
            />
            需要预约
          </label>
          {needBook && (
            <div className="space-y-2 rounded-btn bg-surface-2/80 p-3">
              <label className="block text-xs text-ink-muted">
                提前几天提醒
                <input
                  type="number"
                  min={0}
                  className="mt-1 h-11 w-full rounded-btn bg-bg px-3 text-sm outline-none"
                  value={bookAhead}
                  onChange={(e) => setBookAhead(e.target.value)}
                />
              </label>
              <label className="block text-xs text-ink-muted">
                预约链接（可选）
                <input
                  type="url"
                  placeholder="https://"
                  className="mt-1 h-11 w-full rounded-btn bg-bg px-3 text-sm outline-none"
                  value={bookUrl}
                  onChange={(e) => setBookUrl(e.target.value)}
                />
              </label>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            保存
          </Button>
        </form>

        {item.legToNext && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-ink-muted">
              前往下一站
              {item.legToNext.durationMin != null ? ` · 约 ${item.legToNext.durationMin} 分` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => void onLeg(m)}
                  className={`h-8 rounded-full px-3 text-xs ${
                    item.legToNext!.mode === m
                      ? "bg-accent text-accent-dark"
                      : "bg-surface-2 text-accent-dark"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={busy || index === 0} onClick={() => void onMove(-1)}>
            上移
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={busy || index >= day.items.length - 1}
            onClick={() => void onMove(1)}
          >
            下移
          </Button>
        </div>

        <button
          type="button"
          className="mt-4 w-full py-3 text-sm text-danger"
          disabled={busy}
          onClick={() => void onDelete()}
        >
          删除此点
        </button>
    </Sheet>
  );
}
