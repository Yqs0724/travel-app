import { useOutletContext } from "react-router-dom";
import type { TripDay, WriteOpts } from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { NearbyPanel } from "@/features/nearby/NearbyPanel";

type Ctx = {
  trip: TripDetail | null;
  setTrip: (t: TripDetail | null | ((prev: TripDetail | null) => TripDetail | null)) => void;
  writeOpts?: WriteOpts;
};

export function NearbyPage() {
  const { trip, setTrip, writeOpts } = useOutletContext<Ctx>();

  if (!trip) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载中…</p>;
  }

  function onDayChange(day: TripDay) {
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        editVersion: day.editVersion ?? prev.editVersion,
        days: prev.days.map((d) => (d.id === day.id ? day : d)),
      };
    });
  }

  return <NearbyPanel trip={trip} onDayChange={onDayChange} writeOpts={writeOpts} />;
}
