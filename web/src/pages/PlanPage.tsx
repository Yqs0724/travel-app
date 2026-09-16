import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isErr } from "@/api/client";
import {
  getBookingReminders,
  getDayTraffic,
  getTripWeather,
  type BookingReminder,
  type DayTraffic,
  type WeatherDay,
} from "@/api/info";
import {
  MODE_LABELS,
  itemTitle,
  updateLeg,
  type ItineraryItem,
  type TransportMode,
  type TripDay,
} from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";
import { IconPin } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { AddPlaceForm } from "@/features/planner/AddPlaceForm";
import { DaySortableList } from "@/features/planner/DaySortableList";
import { ItemEditSheet } from "@/features/planner/ItemEditSheet";
import { MapView } from "@/features/planner/MapView";

const LEG_MODES = Object.keys(MODE_LABELS) as TransportMode[];

type Ctx = {
  trip: TripDetail | null;
  setTrip: (t: TripDetail | null | ((prev: TripDetail | null) => TripDetail | null)) => void;
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
  const { trip, setTrip } = useOutletContext<Ctx>();
  const [dayIndex, setDayIndex] = useState(0);
  const [editing, setEditing] = useState<{ item: ItineraryItem; index: number } | null>(null);
  const [legEditId, setLegEditId] = useState<string | null>(null);
  const [legBusy, setLegBusy] = useState(false);
  const [legError, setLegError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [weatherByDate, setWeatherByDate] = useState<Map<string, WeatherDay>>(new Map());
  const [weatherHint, setWeatherHint] = useState<string | null>(null);
  const [reminders, setReminders] = useState<BookingReminder[]>([]);
  const [traffic, setTraffic] = useState<DayTraffic | null>(null);

  useEffect(() => {
    dotRefs.current[dayIndex]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [dayIndex]);

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

  const day = useMemo(() => {
    if (!trip?.days.length) return null;
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
        return { ...prev, days: prev.days.map((d) => (d.id === next.id ? next : d)) };
      });
    },
    [setTrip],
  );

  function openItem(item: ItineraryItem, index: number) {
    setLegEditId(null);
    setEditing({ item, index });
    setFocusId(item.id);
  }

  const legFrom = legEditId ? items.find((i) => i.id === legEditId) : undefined;
  const legTo =
    legFrom && day
      ? day.items[day.items.findIndex((i) => i.id === legFrom.id) + 1]
      : undefined;

  async function onPickLegMode(mode: TransportMode) {
    if (!legFrom?.legToNext) return;
    setLegBusy(true);
    setLegError(null);
    const res = await updateLeg(legFrom.id, mode);
    setLegBusy(false);
    if (isErr(res)) {
      setLegError(res.message || "更新失败");
      return;
    }
    onDayChange(res.data);
    setLegEditId(null);
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

  return (
    <div className="relative flex h-[calc(100dvh-7.5rem)] flex-col overflow-hidden">
      <div className="shrink-0 px-4 pb-2 pt-3">
        <p className="text-center text-sm font-semibold tabular-nums">
          {dayDate?.title}
          {dayWeather?.warn && (
            <span className="ml-1 text-xs font-medium text-warn" title={dayWeather.summary ?? "异常天气"}>
              · 天气注意
            </span>
          )}
        </p>
        <p className={`mt-0.5 text-center text-[11px] ${weatherLine.warn ? "text-warn" : "text-ink-muted"}`}>
          {weatherLine.text}
        </p>
        {traffic && (
          <p
            className={`mt-0.5 text-center text-[11px] ${
              traffic.status != null && traffic.status >= 3 ? "text-warn" : "text-ink-muted"
            }`}
          >
            {traffic.summary}
          </p>
        )}
        <div className="mt-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex w-max justify-center gap-0.5">
            {trip.days.map((d, i) => {
              const meta = dayMeta(d.date, i);
              const active = i === dayIndex;
              const warn = weatherByDate.get(meta.key)?.warn;
              return (
                <button
                  key={d.id}
                  ref={(el) => {
                    dotRefs.current[i] = el;
                  }}
                  type="button"
                  aria-label={meta.title}
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    setDayIndex(i);
                    setEditing(null);
                    setLegEditId(null);
                    setFocusId(null);
                    setAddOpen(false);
                  }}
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
      </div>

      {urgentReminders.length > 0 && (
        <div className="shrink-0 border-b border-line px-4 py-2">
          <p className="mb-1 text-[11px] font-medium text-info">预约提醒</p>
          <ul className="space-y-1">
            {urgentReminders.slice(0, 3).map((r) => (
              <li key={r.itemId} className="flex items-center gap-2 text-xs">
                <span className={r.status === "overdue" ? "text-danger" : "text-info"}>
                  {r.status === "overdue" ? "已过期" : "今日"}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.bookUrl ? (
                  <a
                    href={r.bookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-accent-dark underline"
                  >
                    去预约
                  </a>
                ) : (
                  <span className="shrink-0 text-ink-muted">提前{r.bookAheadDays}天</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative z-0 min-h-0 flex-1 isolate">
        {day ? (
          <MapView
            items={day.items}
            focusId={focusId}
            showTraffic={!!traffic?.liveMap}
            onSelectPoint={(id) => {
              const idx = day.items.findIndex((x) => x.id === id);
              const it = day.items[idx];
              if (it && idx >= 0) openItem(it, idx);
            }}
            onEditLeg={(fromId) => {
              setEditing(null);
              setLegError(null);
              setLegEditId(fromId);
            }}
            className="h-full w-full"
          />
        ) : null}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-drawer mx-auto flex max-w-[480px] flex-col rounded-t-[20px] border border-b-0 border-line bg-bg shadow-warm"
        style={{
          height: `${heightVh()}vh`,
          maxHeight: "calc(100% - 4rem)",
          transition: dragH == null ? "height 0.2s ease" : undefined,
        }}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none px-4 pb-1 pt-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="button"
          aria-label="拖动调整目录高度"
        >
          <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-line" />
          <p className="text-center text-sm font-semibold">
            今日 · {dayDate?.short ?? ""} · {items.length} 站
            {noCoordCount > 0 && (
              <span className="ml-1 text-xs font-normal text-warn">（{noCoordCount} 站无坐标）</span>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {items.length === 0 && !addOpen ? (
            <p className="py-4 text-center text-sm text-ink-muted">这一天还空着，先添加一站</p>
          ) : (
            day && (
              <DaySortableList
                day={day}
                focusId={focusId}
                onOpen={openItem}
                onDayChange={onDayChange}
              />
            )
          )}

          {addOpen ? (
            <div className="pt-3">
              <AddPlaceForm day={day!} onDayChange={onDayChange} onDone={() => setAddOpen(false)} />
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
          )}
        </div>
      </div>

      {editing && day && (
        <ItemEditSheet
          day={day}
          item={editing.item}
          index={editing.index}
          tripId={trip.id}
          onDayChange={(d) => {
            onDayChange(d);
            const idx = d.items.findIndex((x) => x.id === editing.item.id);
            const next = idx >= 0 ? d.items[idx] : undefined;
            if (next) setEditing({ item: next, index: idx });
            else setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <Sheet
        open={!!legFrom?.legToNext}
        onClose={() => {
          setLegEditId(null);
          setLegError(null);
        }}
        aria-label="更换交通方式"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold">更换交通方式</p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {legFrom ? itemTitle(legFrom) : ""}
              {legTo ? ` → ${itemTitle(legTo)}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="h-11 w-11 text-lg text-ink-muted"
            onClick={() => setLegEditId(null)}
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
              variant={legFrom?.legToNext?.mode === m ? "primary" : "secondary"}
              disabled={legBusy}
              className="min-w-[4.5rem]"
              onClick={() => void onPickLegMode(m)}
            >
              {MODE_LABELS[m]}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
