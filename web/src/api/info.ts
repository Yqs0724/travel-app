import { api } from "./client";

export type WeatherDay = {
  date: string;
  warn: boolean;
  summary: string | null;
  covered?: boolean;
};

export type TripWeather = {
  city: string | null;
  forecastFrom?: string | null;
  forecastTo?: string | null;
  days: WeatherDay[];
};

export type BookingReminder = {
  itemId: string;
  dayId: string;
  title: string;
  dayDate: string;
  needBook: true;
  bookAheadDays: number;
  remindOn: string;
  bookUrl: string | null;
  status: "overdue" | "due" | "upcoming";
};

export function getTripWeather(tripId: string) {
  return api<TripWeather>(`/api/v1/trips/${tripId}/weather`);
}

export function getBookingReminders(tripId: string) {
  return api<BookingReminder[]>(`/api/v1/trips/${tripId}/booking-reminders`);
}

export type DayTraffic = {
  mode: "live" | "future_tip" | "past" | "no_poi";
  isToday: boolean;
  liveMap: boolean;
  summary: string;
  status?: number;
};

export function getDayTraffic(tripId: string, dayId: string) {
  return api<DayTraffic>(`/api/v1/trips/${tripId}/days/${dayId}/traffic`);
}
