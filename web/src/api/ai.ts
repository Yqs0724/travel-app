import { api } from "./client";
import type { TripDetail } from "./trips";

export type CandidatePoi = {
  name: string;
  amapId?: string;
  lng?: number;
  lat?: number;
  city?: string;
  category?: string;
  address?: string;
  resolved: boolean;
};

export type DraftItem = {
  name: string;
  amapId?: string;
  lng?: number;
  lat?: number;
  city?: string;
  category?: string;
  startTime?: string;
  durationMin: number;
};

export type DraftDay = {
  dayId: string;
  date: string;
  items: DraftItem[];
};

export function extractPois(text: string, city?: string) {
  return api<{ places: CandidatePoi[]; source: "llm" | "rules" }>("/api/v1/ai/extract-pois", {
    method: "POST",
    body: JSON.stringify({ text, city }),
  });
}

export function planItinerary(
  tripId: string,
  pois: Array<{
    name: string;
    amapId?: string;
    lng?: number;
    lat?: number;
    city?: string;
    category?: string;
  }>,
) {
  return api<DraftDay[]>("/api/v1/ai/plan", {
    method: "POST",
    body: JSON.stringify({ tripId, pois }),
  });
}

export function commitPlan(tripId: string, days: DraftDay[]) {
  return api<TripDetail>("/api/v1/ai/commit", {
    method: "POST",
    body: JSON.stringify({ tripId, days }),
  });
}
