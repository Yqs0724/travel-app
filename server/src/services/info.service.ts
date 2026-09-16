import { prisma } from "../lib/prisma.js";
import * as amap from "../providers/amap.js";

/** 异常天气：暴雨/大雪/高温等，供时间轴/日点标记 */
export function isAbnormalWeather(cast: {
  dayWeather: string;
  nightWeather: string;
  dayTemp: number | null;
  nightTemp: number | null;
}): boolean {
  const text = `${cast.dayWeather}${cast.nightWeather}`;
  if (/暴雨|大雨|雷|暴雪|大雪|冰雹|台风|沙尘|雾霾/.test(text)) return true;
  const temps = [cast.dayTemp, cast.nightTemp].filter((t): t is number => t != null && Number.isFinite(t));
  if (temps.some((t) => t >= 35)) return true;
  if (temps.some((t) => t <= -5)) return true;
  return false;
}

function dateKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 行程「当天」按东八区算，避免 UTC 跨日错位 */
export function todayKeyShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function classifyTrafficDay(
  dayKey: string,
  todayKey: string,
): "today" | "future" | "past" {
  if (dayKey === todayKey) return "today";
  if (dayKey > todayKey) return "future";
  return "past";
}

function addDaysUTC(isoDate: string, delta: number): string {
  const [y, m, day] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, day!, 12));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dateKeyUTC(dt);
}

export async function getTripWeather(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { date: "asc" },
        include: { items: { include: { poi: true }, orderBy: { seq: "asc" } } },
      },
    },
  });
  if (!trip) return null;

  let lng: number | null = null;
  let lat: number | null = null;
  for (const day of trip.days) {
    for (const item of day.items) {
      if (item.poi && Number.isFinite(item.poi.lng) && Number.isFinite(item.poi.lat)) {
        lng = item.poi.lng;
        lat = item.poi.lat;
        break;
      }
    }
    if (lng != null) break;
  }
  if (lng == null || lat == null) {
    return {
      city: null as string | null,
      forecastFrom: null as string | null,
      forecastTo: null as string | null,
      days: trip.days.map((d) => ({
        date: dateKeyUTC(d.date),
        warn: false,
        summary: null as string | null,
        covered: false,
      })),
    };
  }

  const weather = await amap.weatherByLocation(lng, lat);
  const byDate = new Map(weather.casts.map((c) => [c.date, c]));

  const days = trip.days.map((d) => {
    const key = dateKeyUTC(d.date);
    const cast = byDate.get(key);
    if (!cast) {
      return {
        date: key,
        warn: false,
        summary: null as string | null,
        covered: false,
      };
    }
    const summary = `${cast.dayWeather} ${cast.dayTemp ?? "?"}° / ${cast.nightWeather} ${cast.nightTemp ?? "?"}°`;
    return { date: key, warn: isAbnormalWeather(cast), summary, covered: true };
  });

  return {
    city: weather.city,
    forecastFrom: weather.casts[0]?.date ?? null,
    forecastTo: weather.casts[weather.casts.length - 1]?.date ?? null,
    days,
  };
}

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

export function computeBookingReminders(
  items: Array<{
    id: string;
    dayId: string;
    dayDate: Date;
    needBook: boolean;
    bookAheadDays: number | null;
    bookUrl: string | null;
    customName: string | null;
    poiName: string | null;
  }>,
  todayISO: string,
): BookingReminder[] {
  const out: BookingReminder[] = [];
  for (const it of items) {
    if (!it.needBook) continue;
    const ahead = it.bookAheadDays ?? 0;
    const dayDate = dateKeyUTC(it.dayDate);
    const remindOn = addDaysUTC(dayDate, -ahead);
    let status: BookingReminder["status"] = "upcoming";
    if (remindOn < todayISO) status = "overdue";
    else if (remindOn === todayISO) status = "due";
    out.push({
      itemId: it.id,
      dayId: it.dayId,
      title: it.poiName || it.customName || "未命名",
      dayDate,
      needBook: true,
      bookAheadDays: ahead,
      remindOn,
      bookUrl: it.bookUrl,
      status,
    });
  }
  out.sort((a, b) => a.remindOn.localeCompare(b.remindOn));
  return out;
}

export async function getBookingReminders(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        include: {
          items: { include: { poi: true } },
        },
      },
    },
  });
  if (!trip) return null;

  const todayISO = todayKeyShanghai();
  const flat = trip.days.flatMap((d) =>
    d.items.map((it) => ({
      id: it.id,
      dayId: d.id,
      dayDate: d.date,
      needBook: it.needBook,
      bookAheadDays: it.bookAheadDays,
      bookUrl: it.bookUrl,
      customName: it.customName,
      poiName: it.poi?.name ?? null,
    })),
  );
  return computeBookingReminders(flat, todayISO);
}

export type DayTrafficResult = {
  mode: "live" | "future_tip" | "past" | "no_poi";
  isToday: boolean;
  liveMap: boolean;
  summary: string;
  status?: number;
};

export async function getDayTraffic(tripId: string, dayId: string): Promise<DayTrafficResult | null> {
  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId },
    include: { items: { include: { poi: true } } },
  });
  if (!day) return null;

  const key = dateKeyUTC(day.date);
  const today = todayKeyShanghai();
  const kind = classifyTrafficDay(key, today);

  if (kind === "past") {
    return {
      mode: "past",
      isToday: false,
      liveMap: false,
      summary: "该日已过，无实时路况",
    };
  }
  if (kind === "future") {
    return {
      mode: "future_tip",
      isToday: false,
      liveMap: false,
      summary: "非行程当天：无法预知拥堵。出行日早晚高峰（约 7–9 点、17–19 点）留意主干道。",
    };
  }

  const pts = day.items
    .map((i) => i.poi)
    .filter((p): p is NonNullable<typeof p> => !!p && Number.isFinite(p.lng) && Number.isFinite(p.lat));

  if (pts.length === 0) {
    return {
      mode: "no_poi",
      isToday: true,
      liveMap: false,
      summary: "今日暂无坐标点，无法圈定路况范围",
    };
  }

  try {
    let overview: amap.TrafficOverview;
    if (pts.length === 1) {
      overview = await amap.trafficCircle(pts[0]!.lng, pts[0]!.lat, 6000);
    } else {
      const lngs = pts.map((p) => p.lng);
      const lats = pts.map((p) => p.lat);
      const pad = 0.02;
      overview = await amap.trafficRectangle(
        Math.min(...lngs) - pad,
        Math.min(...lats) - pad,
        Math.max(...lngs) + pad,
        Math.max(...lats) + pad,
      );
    }
    const label =
      overview.status === 1
        ? "畅通"
        : overview.status === 2
          ? "缓行"
          : overview.status === 3
            ? "拥堵"
            : overview.status === 4
              ? "严重拥堵"
              : "未知";
    return {
      mode: "live",
      isToday: true,
      liveMap: true,
      status: overview.status,
      summary: `实时路况 · ${label}：${overview.description}`,
    };
  } catch (e) {
    const err = e as Error;
    return {
      mode: "live",
      isToday: true,
      liveMap: true,
      summary: `路况暂不可用（${err.message}），地图仍可开路况图层`,
    };
  }
}
