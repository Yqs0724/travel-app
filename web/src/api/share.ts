import { api, type ApiOpts } from "./client";
import type { TripDay } from "./planner";

export type ShareTrip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  days: TripDay[];
};

export type ShareTripSnapshot = {
  kind?: "trip";
  token: string;
  canEdit: boolean;
  editVersion: number;
  trip: ShareTrip;
};

export type AaShareExpense = {
  id: string;
  category: string;
  amount: number;
  payer: string;
  date: string;
  note: string | null;
  hasReceipt: boolean;
  splits: Array<{ member: string; ratio: number }>;
};

export type AaShareSnapshot = {
  kind: "aa";
  token: string;
  canEdit: false;
  trip: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
  };
  expenses: AaShareExpense[];
  transfers: Array<{ from: string; to: string; amount: number }>;
  totalShared: number;
  myShare: number;
  othersOweMe: number;
};

export type ShareSnapshot = ShareTripSnapshot | AaShareSnapshot;

export function createShare(tripId: string) {
  return api<{ token: string; path: string; expiresAt: string | null }>(
    `/api/v1/trips/${tripId}/share`,
    { method: "POST" },
  );
}

export function createAaShare(tripId: string) {
  return api<{ token: string; path: string; expiresAt: string | null; sharedCount: number }>(
    `/api/v1/trips/${tripId}/share/aa`,
    { method: "POST" },
  );
}

export function createEditShare(tripId: string) {
  return api<{ token: string; path: string; expiresAt: string | null }>(
    `/api/v1/trips/${tripId}/share/edit`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function getShare(token: string) {
  return api<ShareSnapshot>(`/api/v1/share/${token}`);
}

export function unlockShare(token: string) {
  return api<{ token: string; editVersion: number; members: string; trip: ShareTrip }>(
    `/api/v1/share/${token}/unlock`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export type ShareLinkRow = {
  token: string;
  canEdit: boolean;
  kind?: "trip" | "aa";
  expiresAt: string | null;
  active: boolean;
  path: string;
};

export function listShares(tripId: string) {
  return api<ShareLinkRow[]>(`/api/v1/trips/${tripId}/shares`);
}

export function revokeShare(tripId: string, token: string) {
  return api<ShareLinkRow[]>(`/api/v1/trips/${tripId}/shares/${token}`, { method: "DELETE" });
}

export type WriteOpts = ApiOpts & { expectedVersion?: number };

export function aaReceiptUrl(token: string, expenseId: string) {
  return `/api/v1/share/${token}/expenses/${expenseId}/receipt`;
}
