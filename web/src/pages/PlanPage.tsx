import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isErr } from "@/api/client";
import {
  formatReminderWhen,
  getBookingReminders,
  getDayTraffic,
  getTripWeather,
  type BookingReminder,
  type DayTraffic,
  type WeatherDay,
} from "@/api/info";
import {
  MODE_LABELS,
  clearDayItems,
  fetchRoute,
  itemTitle,
  updateLeg,
  type ItineraryItem,
  type TransportMode,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";
import { IconPin } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { AddPlaceForm } from "@/features/planner/AddPlaceForm";
import { DaySortableList } from "@/features/planner/DaySortableList";
import { ItemEditSheet } from "@/features/planner/ItemEditSheet";
import { MapView, LEG_COLORS } from "@/features/planner/MapView";

const LEG_MODES = Object.keys(MODE_LABELS) as TransportMode[];

const OVERVIEW_MODES = [
  ["day", "当天路线"],
  ["measure", "点选测距"],
] as const;
type OverviewMode = (typeof OVERVIEW_MODES)[number][0];
type SpanOverride = { mode: TransportMode; durationMin: number | null };

/** 两点一条线，三点起按点击顺序封闭。 */
function spanEdges(ids: string[]): [string, string][] {
  if (ids.length < 2) return [];
  const n = ids.length >= 3 ? ids.length : 1;
  const out: [string, string][] = [];
  for (let i = 0; i < n; i++) out.push([ids[i]!, ids[(i + 1) % ids.length]!]);
  return out;
}

/** 点掉一条线。最后一条连选中一起清掉，否则只藏这条边。 */
function nextMeasure(ids: string[], cut: string[], dropKey: string) {
  const nextCut = cut.includes(dropKey) ? cut : [...cut, dropKey];
  const visible = spanEdges(ids).filter(([a, b]) => !nextCut.includes(`${a}>${b}`));
  if (visible.length === 0) return { ids: [] as string[], cut: [] as string[] };
  return { ids, cut: nextCut };
}

{
  const two = nextMeasure(["a", "b"], [], "a>b");
  const tri = nextMeasure(["a", "b", "c"], [], "a>b");
  if (two.ids.length !== 0 || two.cut.length !== 0) throw new Error("span: last line");
  if (tri.ids.join() !== "a,b,c" || tri.cut.join() !== "a>b") throw new Error("span: one side");
}

type Ctx = {
  trip: TripDetail | null;
  setTrip: (t: TripDetail | null | ((prev: TripDetail | null) => TripDetail | null)) => void;
  writeOpts?: WriteOpts;
};

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dayMeta(iso: string, index: number) {
  const d = new Date(iso);
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const week = WEEK[d.getUTCDay()] ?? "";
  const short = `${mmdd} 周${week}`;
  return { title: `第 ${index + 1} 天 · ${short}`, short, key: dayKey(iso) };
}

/** 抽屉高度（vh）：半开 / 全开 / 收起 */
const SNAP = { half: 42, full: 72, peek: 13 } as const;
type Snap = "half" | "full" | "peek";

export function PlanPage() {
  const { trip, setTrip, writeOpts } = useOutletContext<Ctx>();
  const [dayIndex, setDayIndex] = useState(-1);
  const [editing, setEditing] = useState<{ item: ItineraryItem; index: number } | null>(null);
  const [legEditId, setLegEditId] = useState<string | null>(null);
  const [legMinutes, setLegMinutes] = useState("");
  const [legBusy, setLegBusy] = useState(false);
  const [legError, setLegError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const daySwipe = useRef<{ x: number; y: number } | null>(null);
  const dayIndexRef = useRef(dayIndex);
  const dayCountRef = useRef(trip?.days.length ?? 0);
  dayIndexRef.current = dayIndex;
  dayCountRef.current = trip?.days.length ?? 0;
  const [weatherByDate, setWeatherByDate] = useState<Map<string, WeatherDay>>(new Map());
  const [weatherHint, setWeatherHint] = useState<string | null>(null);
  const [reminders, setReminders] = useState<BookingReminder[]>([]);
  const [traffic, setTraffic] = useState<DayTraffic | null>(null);
  const [overviewMode, setOverviewMode] = useState<OverviewMode>("day");
  const [measureIds, setMeasureIds] = useState<string[]>([]);
  const [cutKeys, setCutKeys] = useState<string[]>([]);
  const [spanOverrides, setSpanOverrides] = useState<Record<string, SpanOverride>>({});
  const [spanEdit, setSpanEdit] = useState<{ fromId: string; toId: string; mode: TransportMode } | null>(null);

  useEffect(() => {
    const el = dotRefs.current[dayIndex + 1];
    const scroller = el?.closest("[data-day-dots]");
    if (!el || !(scroller instanceof HTMLElement)) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left) });
  }, [dayIndex]);

  useEffect(() => {
    const prev = document.body.style.touchAction;
    document.body.style.touchAction = "pan-y";

    function down(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,select,[data-map]")) return;
      daySwipe.current = { x: e.clientX, y: e.clientY };
    }
    function up(e: PointerEvent) {
      const start = daySwipe.current;
      daySwipe.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      // 右滑下一天，左滑上一天
      const next = dayIndexRef.current + (dx > 0 ? 1 : -1);
      if (next < -1 || next >= dayCountRef.current) return;
      setDayIndex(next);
      setEditing(null);
      setLegEditId(null);
      setFocusId(null);
      setAddOpen(false);
    }

    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      document.body.style.touchAction = prev;
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  useEffect(() => {
    if (!trip?.id) return;
    void getTripWeather(trip.id).then((res) => {
      if (isErr(res)) {
        setWeatherHint(res.message || "天气暂不可用");
        setWeatherByDate(new Map());
        return;
      }
      setWeatherHint(null);
      setWeatherByDate(new Map(res.data.days.map((d) => [d.date, d])));
    });
  }, [trip?.id]);

  useEffect(() => {
    if (!trip?.id) return;
    void getBookingReminders(trip.id).then((res) => {
      if (!isErr(res)) setReminders(res.data);
    });
  }, [trip]);

  useEffect(() => {
    setDayIndex(-1);
    setEditing(null);
    setLegEditId(null);
    setFocusId(null);
    setAddOpen(false);
  }, [trip?.id]);

  const overview = dayIndex < 0;
  const measureOn = overviewMode === "measure";
  const showDayRoutes = overviewMode === "day";
  const overviewGroups = useMemo(() => {
    if (!overview || !trip) return undefined;
    return trip.days.map((d) => d.items);
  }, [overview, trip?.days]);

  useEffect(() => {
    if (!measureOn) {
      setMeasureIds((prev) => (prev.length === 0 ? prev : []));
      setCutKeys((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const visible = new Set((overviewGroups ?? []).flat().map((i) => i.id));
    setMeasureIds((prev) => {
      const next = prev.filter((id) => visible.has(id));
      if (next.length !== prev.length) {
        const live = new Set(spanEdges(next).map(([a, b]) => `${a}>${b}`));
        setCutKeys((cut) => {
          const pruned = cut.filter((k) => live.has(k));
          return pruned.length === cut.length ? cut : pruned;
        });
      }
      return next.length === prev.length ? prev : next;
    });
  }, [measureOn, overviewGroups]);
  const day = useMemo(() => {
    if (!trip?.days.length || dayIndex < 0) return null;
    const i = Math.min(dayIndex, trip.days.length - 1);
    return trip.days[i] ?? null;
  }, [trip, dayIndex]);

  useEffect(() => {
    if (!trip?.id || !day?.id) {
      setTraffic(null);
      return;
    }
    void getDayTraffic(trip.id, day.id).then((res) => {
      if (isErr(res)) {
        setTraffic({
          mode: "live",
          isToday: false,
          liveMap: false,
          summary: res.message || "路况暂不可用",
        });
        return;
      }
      setTraffic(res.data);
    });
  }, [trip?.id, day?.id]);

  const items = day?.items ?? [];
  const noCoordCount = items.filter((i) => !i.poi).length;
  const dayWeather = day ? weatherByDate.get(dayKey(day.date)) : undefined;
  const weatherLine = (() => {
    if (weatherHint) return { text: weatherHint, warn: false };
    if (!dayWeather) return { text: "天气加载中…", warn: false };
    if (dayWeather.summary) return { text: dayWeather.summary, warn: dayWeather.warn };
    return { text: "该日暂无预报（高德仅覆盖近几日）", warn: false };
  })();
  const urgentReminders = reminders.filter((r) => r.status === "overdue" || r.status === "due");

  const onDayChange = useCallback(
    (next: TripDay) => {
      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          editVersion: next.editVersion ?? prev.editVersion,
          days: prev.days.map((d) => (d.id === next.id ? next : d)),
        };
      });
    },
    [setTrip],
  );

  function openItem(item: ItineraryItem, index: number) {
    setLegEditId(null);
    setEditing({ item, index });
    setFocusId(item.id);
  }

  const legHit = (() => {
    if (!legEditId || !trip) return null;
    for (const d of trip.days) {
      const i = d.items.findIndex((it) => it.id === legEditId);
      if (i < 0) continue;
      return { from: d.items[i]!, to: d.items[i + 1] };
    }
    return null;
  })();

  useEffect(() => {
    const n = legHit?.from.legToNext?.durationMin;
    setLegMinutes(n != null && n > 0 ? String(n) : "");
  }, [legEditId, legHit?.from.legToNext?.durationMin]);

  function openLeg(fromId: string) {
    setSpanEdit(null);
    setEditing(null);
    setLegError(null);
    setLegEditId(fromId);
  }

  function findItem(id: string) {
    for (const d of trip?.days ?? []) {
      const it = d.items.find((x) => x.id === id);
      if (it) return it;
    }
    return undefined;
  }

  const spanHit =
    spanEdit && trip
      ? { from: findItem(spanEdit.fromId), to: findItem(spanEdit.toId), mode: spanEdit.mode }
      : null;

  function openSpan(fromId: string, toId: string, mode: string, durationMin: number | null) {
    const picked = (LEG_MODES as string[]).includes(mode) ? (mode as TransportMode) : "drive";
    setLegEditId(null);
    setEditing(null);
    setLegError(null);
    setSpanEdit({ fromId, toId, mode: picked });
    setLegMinutes(durationMin != null && durationMin > 0 ? String(durationMin) : "");
  }

  function cancelSpan(fromId: string, toId: string) {
    const key = `${fromId}>${toId}`;
    setSpanEdit((cur) => (cur && `${cur.fromId}>${cur.toId}` === key ? null : cur));
    setMeasureIds((ids) => {
      const next = nextMeasure(ids, cutKeys, key);
      setCutKeys(next.cut);
      return next.ids;
    });
  }

  async function onPickSpanMode(mode: TransportMode) {
    if (!spanHit?.from?.poi || !spanHit.to?.poi || !spanEdit) return;
    setLegBusy(true);
    setLegError(null);
    const res = await fetchRoute(
      { lng: spanHit.from.poi.lng, lat: spanHit.from.poi.lat },
      { lng: spanHit.to.poi.lng, lat: spanHit.to.poi.lat },
      mode,
    );
    setLegBusy(false);
    if (isErr(res)) {
      setLegError(res.message || "更新失败");
      return;
    }
    setSpanOverrides((prev) => ({
      ...prev,
      [`${spanEdit.fromId}>${spanEdit.toId}`]: { mode, durationMin: res.data.durationMin },
    }));
    setSpanEdit(null);
  }

  async function onPickLegMode(mode: TransportMode) {
    if (!legHit?.from.legToNext) return;
    setLegBusy(true);
    setLegError(null);
    const res = await updateLeg(legHit.from.id, mode, writeOpts);
    setLegBusy(false);
    if (isErr(res)) {
      setLegError(res.message || "更新失败");
      return;
    }
    onDayChange(res.data);
    setLegEditId(null);
  }

  async function onSaveLegMinutes() {
    if (spanEdit) {
      const n = Number(legMinutes);
      if (!Number.isInteger(n) || n < 1 || n > 60 * 48) {
        setLegError("用时填 1–2880 的整数分钟");
        return;
      }
      setSpanOverrides((prev) => ({
        ...prev,
        [`${spanEdit.fromId}>${spanEdit.toId}`]: { mode: spanEdit.mode, durationMin: n },
      }));
      setSpanEdit(null);
      return;
    }
    const leg = legHit?.from.legToNext;
    if (!legHit || !leg) return;
    const n = Number(legMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 60 * 48) {
      setLegError("用时填 1–2880 的整数分钟");
      return;
    }
    const mode = (LEG_MODES as string[]).includes(leg.mode) ? (leg.mode as TransportMode) : "drive";
    setLegBusy(true);
    setLegError(null);
    const res = await updateLeg(legHit.from.id, mode, writeOpts, n);
    setLegBusy(false);
    if (isErr(res)) {
      setLegError(res.message || "更新失败");
      return;
    }
    onDayChange(res.data);
    setLegEditId(null);
  }

  async function onClearDay() {
    if (!day || day.items.length === 0 || clearing) return;
    if (!confirm(`清空今天的 ${day.items.length} 个地点？不可恢复`)) return;
    setClearing(true);
    setLegError(null);
    const res = await clearDayItems(day.id, writeOpts);
    setClearing(false);
    if (isErr(res)) {
      setLegError(res.message || "清空失败");
      return;
    }
    onDayChange(res.data);
    setEditing(null);
    setLegEditId(null);
    setFocusId(null);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { y: e.clientY, h: heightVh() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function heightVh() {
    return dragH ?? SNAP[snap];
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    const vh = (dy / window.innerHeight) * 100;
    const next = Math.min(80, Math.max(10, dragRef.current.h + vh));
    setDragH(next);
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    const h = heightVh();
    const dist = (s: Snap) => Math.abs(h - SNAP[s]);
    const best = (["peek", "half", "full"] as Snap[]).reduce((a, b) => (dist(b) < dist(a) ? b : a));
    setSnap(best);
    setDragH(null);
  }

  if (!trip) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载中…</p>;
  }

  const dayDate = day ? dayMeta(day.date, dayIndex) : null;

  function goDay(i: number) {
    setDayIndex(i);
    setEditing(null);
    setLegEditId(null);
    setFocusId(null);
    setAddOpen(false);
  }

  return (
    <div className="plan-root relative flex h-[calc(100dvh-7.5rem)] flex-col overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
      <div className="plan-head shrink-0 px-4 pb-2 pt-3">
        <p className="text-center text-sm font-semibold tabular-nums">
          {overview ? "全程总览" : dayDate?.title}
          {!overview && dayWeather?.warn && (
            <span className="ml-1 text-xs font-medium text-warn" title={dayWeather.summary ?? "异常天气"}>
              · 天气注意
            </span>
          )}
        </p>
        {overview ? (
          <p className="mt-0.5 text-center text-[11px] text-ink-muted">
            {measureOn
              ? "点标点测距。点线取消，点标签改信息"
              : "各天路线 · 点圆点进入某一天"}
            {measureOn && measureIds.length > 0 && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  setMeasureIds([]);
                  setCutKeys([]);
                }}
              >
                清除
              </button>
            )}
          </p>
        ) : (
          <p className={`mt-0.5 text-center text-[11px] ${weatherLine.warn ? "text-warn" : "text-ink-muted"}`}>
            {weatherLine.text}
          </p>
        )}
        {!overview && traffic && (
          <p
            className={`mt-0.5 text-center text-[11px] ${
              traffic.status != null && traffic.status >= 3 ? "text-warn" : "text-ink-muted"
            }`}
          >
            {traffic.summary}
          </p>
        )}
        <div
          className="mt-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-day-dots
        >
          <div className="mx-auto flex w-max justify-center gap-0.5">
            <button
              type="button"
              ref={(el) => {
                dotRefs.current[0] = el;
              }}
              aria-label="全程总览"
              aria-current={overview ? "true" : undefined}
              onClick={() => goDay(-1)}
              className="relative flex shrink-0 items-center justify-center p-2"
            >
              <span
                className={`block h-2.5 w-4 rounded-full ${
                  overview ? "bg-accent" : "border border-accent-dark/30 bg-transparent"
                }`}
              />
            </button>
            {trip.days.map((d, i) => {
              const meta = dayMeta(d.date, i);
              const active = i === dayIndex;
              const warn = weatherByDate.get(meta.key)?.warn;
              return (
                <button
                  key={d.id}
                  ref={(el) => {
                    dotRefs.current[i + 1] = el;
                  }}
                  type="button"
                  aria-label={meta.title}
                  aria-current={active ? "true" : undefined}
                  onClick={() => goDay(i)}
                  className="relative flex shrink-0 items-center justify-center p-2"
                >
                  <span
                    className={`block h-2.5 w-2.5 rounded-full ${
                      active ? "bg-accent" : "border border-accent-dark/30 bg-transparent"
                    }`}
                  />
                  {warn && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {urgentReminders.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="mb-1 text-[11px] font-medium text-info">预约提醒</p>
            <ul className="space-y-1">
              {urgentReminders.slice(0, 3).map((r) => (
                <li key={r.itemId} className="flex items-center gap-2 text-xs">
                  <span
                    className={`shrink-0 tabular-nums ${r.status === "overdue" ? "text-danger" : "text-info"}`}
                  >
                    {r.status === "overdue" ? `已过期 ${formatReminderWhen(r)}` : formatReminderWhen(r)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  {r.bookUrl?.match(/^https?:\/\//i) ? (
                    <a
                      href={r.bookUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-accent-dark underline"
                    >
                      去预约
                    </a>
                  ) : r.bookUrl ? (
                    <span className="max-w-[5.5rem] shrink-0 truncate text-ink-muted" title={r.bookUrl}>
                      {r.bookUrl}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="plan-stage relative flex min-h-0 flex-1 flex-col">
      <div className="plan-map relative z-0 min-h-0 flex-1 isolate">
        {overview && overviewGroups ? (
          <MapView
            groups={overviewGroups}
            pinNumber={(_item, _idx, group) => group + 1}
            showNames
            showDayRoutes={showDayRoutes}
            measureIds={measureOn ? measureIds : []}
            emptyHint="这次行程还没有带坐标的地点"
            onSelectPoint={
              measureOn
                ? (id) =>
                    setMeasureIds((prev) => {
                      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
                      const live = new Set(spanEdges(next).map(([a, b]) => `${a}>${b}`));
                      setCutKeys((cut) => {
                        const pruned = cut.filter((k) => live.has(k));
                        return pruned.length === cut.length ? cut : pruned;
                      });
                      return next;
                    })
                : undefined
            }
            onEditLeg={showDayRoutes ? openLeg : undefined}
            spanOverrides={spanOverrides}
            cutSpanKeys={cutKeys}
            onEditSpan={openSpan}
            onCancelSpan={cancelSpan}
            className="h-full w-full"
          />
        ) : day ? (
          <MapView
            items={day.items}
            focusId={focusId}
            showTraffic={!!traffic?.liveMap}
            onSelectPoint={(id) => {
              const idx = day.items.findIndex((x) => x.id === id);
              const it = day.items[idx];
              if (it && idx >= 0) openItem(it, idx);
            }}
            onEditLeg={openLeg}
            className="h-full w-full"
          />
        ) : null}
        {overview && (
          <div className="absolute right-3 top-3 z-20">
            <div
              className="relative grid grid-cols-2 rounded-full border border-line bg-bg/95 p-1 shadow-warm"
              role="radiogroup"
              aria-label="地图显示"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 top-1 rounded-full bg-accent-dark transition-transform duration-200 ease-out"
                style={{
                  width: "calc((100% - 8px) / 2)",
                  left: 4,
                  transform: `translateX(${OVERVIEW_MODES.findIndex(([id]) => id === overviewMode) * 100}%)`,
                }}
              />
              {OVERVIEW_MODES.map(([id, label]) => {
                const on = overviewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOverviewMode(id)}
                    className={`relative z-10 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium ${
                      on ? "text-white" : "text-ink-muted"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="plan-sheet absolute inset-x-0 bottom-0 z-drawer mx-auto flex max-w-[480px] flex-col rounded-t-[20px] border border-b-0 border-line bg-bg shadow-warm"
        style={{
          height: `${heightVh()}vh`,
          maxHeight: "calc(100% - 4rem)",
          transition: dragH == null ? "height 0.2s ease" : undefined,
        }}
      >
        <div className="shrink-0 px-4 pb-1 pt-2">
          <div
            className="plan-grip cursor-grab touch-none select-none pb-1"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="button"
            aria-label="拖动调整目录高度"
          >
            <div className="mx-auto h-1 w-9 rounded-full bg-line" />
          </div>
          <p className="relative text-center text-sm font-semibold">
            {overview
              ? `全程 · ${trip.days.reduce((n, d) => n + d.items.length, 0)} 站`
              : `今日 · ${dayDate?.short ?? ""} · ${items.length} 站`}
            {!overview && noCoordCount > 0 && (
              <span className="ml-1 text-xs font-normal text-warn">（{noCoordCount} 站无坐标）</span>
            )}
            {!overview && items.length > 0 && (
              <button
                type="button"
                className="absolute right-0 top-0 text-xs font-normal text-danger disabled:opacity-50"
                disabled={clearing}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void onClearDay();
                }}
              >
                {clearing ? "清空中…" : "清空"}
              </button>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {overview ? (
            <ul>
              {trip.days.map((d, i) => {
                const meta = dayMeta(d.date, i);
                return (
                  <li key={d.id} className="border-b border-line py-2">
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => goDay(i)}>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: LEG_COLORS[i % LEG_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{meta.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {d.items.length === 0 ? "空" : d.items.map(itemTitle).join("、")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">{d.items.length} 站</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : items.length === 0 && !addOpen ? (
            <p className="py-4 text-center text-sm text-ink-muted">这一天还空着，先添加一站</p>
          ) : !overview && day ? (
            <DaySortableList
              day={day}
              focusId={focusId}
              onOpen={openItem}
              onDayChange={onDayChange}
              writeOpts={writeOpts}
            />
          ) : null}

          {!overview && (addOpen ? (
            <div className="pt-3">
              <AddPlaceForm
                day={day!}
                tripDays={trip.days}
                onDayChange={onDayChange}
                onDone={() => setAddOpen(false)}
                writeOpts={writeOpts}
              />
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-3 text-sm text-accent-dark"
              onClick={() => {
                setAddOpen(true);
                setSnap("full");
              }}
            >
              <IconPin size={16} />
              添加地点
            </button>
          ))}
        </div>
      </div>
      </div>

      {editing && day && (
        <ItemEditSheet
          day={day}
          item={editing.item}
          index={editing.index}
          tripId={trip.id}
          tripDays={trip.days}
          onDayChange={(d) => {
            onDayChange(d);
            const idx = d.items.findIndex((x) => x.id === editing.item.id);
            const next = idx >= 0 ? d.items[idx] : undefined;
            if (next) setEditing({ item: next, index: idx });
            else setEditing(null);
          }}
          onClose={() => setEditing(null)}
          writeOpts={writeOpts}
        />
      )}

      <Sheet
        open={!!legHit?.from.legToNext || !!spanHit?.from}
        onClose={() => {
          setLegEditId(null);
          setSpanEdit(null);
          setLegError(null);
        }}
        aria-label="编辑这段路程"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold">编辑这段路程</p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {spanHit?.from ? itemTitle(spanHit.from) : legHit ? itemTitle(legHit.from) : ""}
              {spanHit?.to ? ` → ${itemTitle(spanHit.to)}` : legHit?.to ? ` → ${itemTitle(legHit.to)}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="h-11 w-11 text-lg text-ink-muted"
            onClick={() => {
              setLegEditId(null);
              setSpanEdit(null);
            }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {legError && <p className="mb-2 text-sm text-danger">{legError}</p>}
        <div className="flex flex-wrap gap-2">
          {LEG_MODES.map((m) => (
            <Button
              key={m}
              type="button"
              variant={(spanHit?.mode ?? legHit?.from.legToNext?.mode) === m ? "primary" : "secondary"}
              disabled={legBusy}
              className="min-w-[4.5rem]"
              onClick={() => void (spanHit ? onPickSpanMode(m) : onPickLegMode(m))}
            >
              {MODE_LABELS[m]}
            </Button>
          ))}
        </div>
        <label className="mt-4 block text-xs text-ink-muted">
          用时（分钟）
          <input
            type="number"
            min={1}
            max={2880}
            inputMode="numeric"
            className="mt-1 h-11 w-full rounded-btn bg-surface-2 px-3 text-sm outline-none"
            value={legMinutes}
            onChange={(e) => setLegMinutes(e.target.value)}
          />
        </label>
        <Button type="button" className="mt-3 w-full" disabled={legBusy} onClick={() => void onSaveLegMinutes()}>
          保存用时
        </Button>
      </Sheet>
    </div>
  );
}
