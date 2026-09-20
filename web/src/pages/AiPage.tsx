import { useOutletContext } from "react-router-dom";
import type { WriteOpts } from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { AiPlannerPanel } from "@/features/ai/AiPlannerPanel";

type Ctx = {
  trip: TripDetail | null;
  setTrip: (t: TripDetail | null | ((prev: TripDetail | null) => TripDetail | null)) => void;
  writeOpts?: WriteOpts;
};

export function AiPage() {
  const { trip, setTrip, writeOpts } = useOutletContext<Ctx>();

  if (!trip) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载中…</p>;
  }

  return (
    <div className="px-4 pt-4 pb-4 desk-read">
      <AiPlannerPanel
        tripId={trip.id}
        days={trip.days}
        writeOpts={writeOpts}
        onCommitted={(t) => setTrip(t)}
        onDayChange={(day) =>
          setTrip((prev) =>
            prev
              ? {
                  ...prev,
                  editVersion: day.editVersion ?? prev.editVersion,
                  days: prev.days.map((d) => (d.id === day.id ? day : d)),
                }
              : prev,
          )
        }
      />
    </div>
  );
}
