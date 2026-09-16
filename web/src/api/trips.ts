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
  days: TripDay[];
};

export function login(password: string) {
  return api<{ token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
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
