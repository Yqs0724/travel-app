import { api } from "./client";

export type TripReview = {
  tripId: string;
  title: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  stopCount: number;
  legDistanceKm: number | null;
  legDurationMin: number | null;
  spendTotal: number;
  spendByCategory: Record<string, number>;
  othersOweMe: number;
  days: Array<{
    date: string;
    stops: Array<{ name: string; startTime: string | null }>;
  }>;
  photos: Array<{
    expenseId: string;
    note: string | null;
    category: string;
    amount: number;
    date: string;
  }>;
};

export function getTripReview(tripId: string) {
  return api<TripReview>(`/api/v1/trips/${tripId}/review`);
}
