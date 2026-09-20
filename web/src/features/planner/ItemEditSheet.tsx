import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MODE_LABELS,
  deleteItem,
  formatKm,
  itemTitle,
  reorderItems,
  updateItem,
  updateLeg,
  type ItineraryItem,
  type PoiHit,
  type TransportMode,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";
import { DateField, TimeField } from "@/components/DateTimeFields";
import { Sheet } from "@/components/Sheet";
import { tripPoiHits } from "./tripPois";
const MODES = Object.keys(MODE_LABELS) as TransportMode[];

function addDaysISO(isoDate: string, delta: number): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(
    Number(fromISO.slice(0, 4)),
    Number(fromISO.slice(5, 7)) - 1,
    Number(fromISO.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toISO.slice(0, 4)),
    Number(toISO.slice(5, 7)) - 1,
    Number(toISO.slice(8, 10)),
  );
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** 已有准确时刻优先；否则用「提前 N 天」+ 默认 18:00 */
function resolveRemindFields(
  dayDate: string,
  bookRemindAt: string | null | undefined,
  bookAheadDays: number | null | undefined,
): { date: string; time: string } {
  if (bookRemindAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(bookRemindAt)) {
    return { date: bookRemindAt.slice(0, 10), time: bookRemindAt.slice(11, 16) };
  }
  const visit = dayDate.slice(0, 10);
  const ahead = bookAheadDays ?? 1;
  return { date: addDaysISO(visit, -ahead), time: "18:00" };
}

export function ItemEditSheet({
  day,
  item,
  index,
  tripId,
  tripDays,
  onDayChange,
  onClose,
  writeOpts,
}: {
  day: TripDay;
  item: ItineraryItem;
  index: number;
  /** 有则显示「周边 / 找厕所」跳转；分享页不传 */
  tripId?: string;
  /** 无坐标时可从本行程其它天补坐标 */
  tripDays?: { items: ItineraryItem[] }[];
  onDayChange: (day: TripDay) => void;
  onClose: () => void;
  writeOpts?: WriteOpts;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needBook, setNeedBook] = useState(item.needBook);
  const [mapHidden, setMapHidden] = useState(!!item.mapHidden);
  const initialRemind = resolveRemindFields(day.date, item.bookRemindAt, item.bookAheadDays);
  const [bookDate, setBookDate] = useState(initialRemind.date);
  const [bookTime, setBookTime] = useState(initialRemind.time);
  const [bookUrl, setBookUrl] = useState(item.bookUrl ?? "");
  const [ticket, setTicket] = useState(
    item.ticketPrice != null && item.ticketPrice > 0 ? String(item.ticketPrice) : "",
  );

  const hasCoords =
    item.poi != null && Number.isFinite(item.poi.lng) && Number.isFinite(item.poi.lat);

  const tripHits = useMemo(() => tripPoiHits(tripDays ?? []), [tripDays]);

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

  async function linkPoi(h: PoiHit) {
    setBusy(true);
    const ok = await apply(
      await updateItem(
        item.id,
        {
          poi: {
            name: h.name,
            lng: h.lng,
            lat: h.lat,
            amapId: h.amapId,
            city: h.city,
            category: h.category,
          },
        },
        writeOpts,
      ),
    );
    setBusy(false);
    if (!ok) return;
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await apply(
      await updateItem(
        item.id,
        {
          needBook,
          bookRemindAt: needBook && bookDate ? `${bookDate}T${(bookTime || "18:00").slice(0, 5)}` : null,
          bookAheadDays: needBook ? daysBetween(bookDate || day.date.slice(0, 10), day.date.slice(0, 10)) : null,
          bookUrl: needBook ? bookUrl.trim() || null : null,
          ticketPrice: ticket.trim() === "" ? null : Number(ticket),
          mapHidden,
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
          </div>
          <button type="button" className="h-11 w-11 text-lg text-ink-muted" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-danger">{error}</p>}

        {!hasCoords && tripHits.length > 0 && (
          <div className="mb-3 space-y-1.5">
            <p className="text-xs text-warn">无坐标，地图不显示。点选本行程地点补上：</p>
            <ul className="max-h-28 overflow-y-auto rounded-btn border border-line scroll-warm">
              {tripHits.map((h) => (
                <li key={h.amapId}>
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                    onClick={() => void linkPoi(h)}
                  >
                    {h.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!hasCoords && tripHits.length === 0 && (
          <p className="mb-3 text-xs text-warn">无坐标，地图不显示。请删除后重新搜索添加。</p>
        )}

        <form onSubmit={(e) => void onSave(e)} className="space-y-3">
          <label className="block text-xs text-ink-muted">
            <span className="mb-1 block text-center">门票（元）</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="可选"
              className="h-11 w-full rounded-btn bg-surface-2 px-3 text-center text-sm tabular-nums outline-none"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
            />
          </label>
          <p className="text-center text-xs text-ink-muted">门票为参考估价，不进账单</p>

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

          {hasCoords && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mapHidden}
                onChange={(e) => setMapHidden(e.target.checked)}
                className="h-4 w-4 accent-accent-dark"
              />
              地图上隐藏
            </label>
          )}
          {hasCoords && mapHidden && (
            <p className="text-xs text-ink-muted">不画这个点，前后景点仍连线。目录里还在，可再打开取消。</p>
          )}

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
                提醒日期
                <DateField value={bookDate} onChange={setBookDate} />
              </label>
              <label className="block text-xs text-ink-muted">
                提醒时刻
                <TimeField value={bookTime} onChange={setBookTime} />
              </label>
              <label className="block text-xs text-ink-muted">
                预约方式（可选）
                <input
                  type="text"
                  placeholder="公众号 / 链接 / 电话…"
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
              {formatKm(item.legToNext.distanceM) ? ` · ${formatKm(item.legToNext.distanceM)}` : ""}
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
