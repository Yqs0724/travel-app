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
  bookRemindAt: string | null;
  remindOn: string;
  bookUrl: string | null;
  status: "overdue" | "due" | "upcoming";
};

/** 2026-09-22T18:00 → 9.22 18:00 */
export function formatBookRemindAt(at: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}:\d{2})/.exec(at);
  if (!m) return at;
  return `${Number(m[2])}.${Number(m[3])} ${m[4]}`;
}

/** 右侧提醒时刻：今日 →「今日 12:00」；其它 →「9.15 12:00」 */
export function formatReminderWhen(r: Pick<BookingReminder, "status" | "bookRemindAt" | "remindOn">): string {
  const at =
    r.bookRemindAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.bookRemindAt)
      ? r.bookRemindAt
      : `${r.remindOn}T00:00`;
  const time = at.slice(11, 16);
  if (r.status === "due") return `今日 ${time}`;
  return formatBookRemindAt(at);
}

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
