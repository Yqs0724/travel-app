import { useOutletContext } from "react-router-dom";
import type { TripDetail } from "@/api/trips";
import { AiPlannerPanel } from "@/features/ai/AiPlannerPanel";

type Ctx = {
  trip: TripDetail | null;
  setTrip: (t: TripDetail | null | ((prev: TripDetail | null) => TripDetail | null)) => void;
};

export function AiPage() {
  const { trip, setTrip } = useOutletContext<Ctx>();

  if (!trip) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载中…</p>;
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <AiPlannerPanel tripId={trip.id} onCommitted={(t) => setTrip(t)} />
    </div>
  );
}
