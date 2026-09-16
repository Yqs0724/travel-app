import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { itemTitle, type ItineraryItem } from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { MapView } from "@/features/planner/MapView";

type Ctx = { trip: TripDetail | null };

export function MapPage() {
  const { trip } = useOutletContext<Ctx>();
  const [dayIndex, setDayIndex] = useState(0);

  const day = useMemo(() => {
    if (!trip?.days.length) return null;
    return trip.days[Math.min(dayIndex, trip.days.length - 1)] ?? null;
  }, [trip, dayIndex]);

  if (!trip) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载中…</p>;
  }

  const items: ItineraryItem[] = day?.items ?? [];

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-3">
        {trip.days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDayIndex(i)}
            className={`h-8 shrink-0 rounded-full px-3 text-xs ${
              i === dayIndex ? "bg-accent text-accent-dark" : "bg-surface-2 text-accent-dark"
            }`}
          >
            第 {i + 1} 天 · {d.date.slice(5, 10)}
          </button>
        ))}
      </div>

      <MapView items={items} className="min-h-[42vh] flex-1" />

      <div className="max-h-[28vh] overflow-y-auto border-t border-line px-4 py-3">
        <p className="mb-2 text-xs text-ink-muted">当日地点（有坐标才会上图）</p>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">暂无行程点，去时间轴添加</p>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className="flex items-baseline gap-2 text-sm">
                <span className="tabular-nums text-ink-muted">{i + 1}.</span>
                <span className="font-medium">{itemTitle(it)}</span>
                {!it.poi && <span className="text-xs text-warn">无坐标</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
