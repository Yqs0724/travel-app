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

export function extractPois(
  text: string,
  city?: string,
  mode: "all" | "restaurants" = "all",
  images?: Array<{ mime: "image/jpeg" | "image/png" | "image/webp"; data: string }>,
) {
  return api<{ places: CandidatePoi[]; source: "llm" | "rules" }>("/api/v1/ai/extract-pois", {
    method: "POST",
    body: JSON.stringify({ text, city, mode, images }),
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
  sourceText?: string,
) {
  return api<DraftDay[]>("/api/v1/ai/plan", {
    method: "POST",
    body: JSON.stringify({ tripId, pois, sourceText }),
  });
}

export function commitPlan(tripId: string, days: DraftDay[]) {
  return api<TripDetail>("/api/v1/ai/commit", {
    method: "POST",
    body: JSON.stringify({ tripId, days }),
  });
}

export type AdjustOp =
  | { op: "move"; itemId: string; toDayIndex: number; toSeq?: number }
  | { op: "remove"; itemId: string }
  | { op: "setTime"; itemId: string; startTime: string }
  | { op: "rename"; itemId: string; name: string };

export function proposeAdjust(tripId: string, instruction: string) {
  return api<{ summary: string; ops: AdjustOp[]; source: "llm" | "rules" }>("/api/v1/ai/adjust", {
    method: "POST",
    body: JSON.stringify({ tripId, instruction }),
  });
}

export function applyAdjust(tripId: string, ops: AdjustOp[]) {
  return api<TripDetail>("/api/v1/ai/adjust/apply", {
    method: "POST",
    body: JSON.stringify({ tripId, ops }),
  });
}

export type ChatLinkPage = "plan" | "checklist" | "budget" | "nearby" | "review";

export type ChatReply = {
  reply: string;
  links: Array<{ label: string; page: ChatLinkPage }>;
  handoff: "extract" | "adjust" | null;
  source: "llm" | "rules";
};

export function chatTrip(
  tripId: string,
  message: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return api<ChatReply>("/api/v1/ai/chat", {
    method: "POST",
    body: JSON.stringify({ tripId, message, history }),
  });
}
