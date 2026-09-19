import { api, type ApiOpts } from "./client";
import type { TripDay } from "./planner";

export type TripSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  members: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type TripDetail = TripSummary & {
  editVersion: number;
  days: TripDay[];
};

export function login() {
  return api<{ token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listTrips() {
  return api<TripSummary[]>("/api/v1/trips");
}

export function getTrip(id: string, opts?: ApiOpts) {
  return api<TripDetail>(`/api/v1/trips/${id}`, {}, opts);
}

export function createTrip(body: {
  title: string;
  startDate: string;
  endDate: string;
  members?: string[];
}) {
  return api<TripDetail>("/api/v1/trips", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteTrip(id: string) {
  return api<{ id: string }>(`/api/v1/trips/${id}`, { method: "DELETE" });
}

export function updateTrip(
  id: string,
  body: {
    title?: string;
    startDate?: string;
    endDate?: string;
    members?: string[];
  },
  opts?: ApiOpts,
) {
  return api<TripDetail>(
    `/api/v1/trips/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    opts,
  );
}

/** 解析同行人列表（不含「我」；历史数据里的「我」会滤掉） */
export function parseMembers(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return v.map((s) => s.trim()).filter((m) => m && m !== "我");
    }
  } catch {
    /* ignore */
  }
  return [];
}

export type PendingPlace = {
  id: string;
  name: string;
  startTime?: string | null;
  dayLabel?: string | null;
  amapId?: string | null;
  lng?: number | null;
  lat?: number | null;
  category?: string | null;
};

export function getPending(tripId: string) {
  return api<PendingPlace[]>(`/api/v1/trips/${tripId}/pending`);
}

export function setPending(tripId: string, places: PendingPlace[]) {
  return api<PendingPlace[]>(`/api/v1/trips/${tripId}/pending`, {
    method: "PUT",
    body: JSON.stringify({ places }),
  });
}

export function appendPending(
  tripId: string,
  places: Array<{
    name: string;
    startTime?: string | null;
    dayLabel?: string | null;
    amapId?: string | null;
    lng?: number | null;
    lat?: number | null;
    category?: string | null;
  }>,
) {
  return api<PendingPlace[]>(`/api/v1/trips/${tripId}/pending`, {
    method: "POST",
    body: JSON.stringify({ places }),
  });
}
