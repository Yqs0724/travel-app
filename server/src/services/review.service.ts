import { prisma } from "../lib/prisma.js";

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

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function itemName(it: { customName: string | null; poi: { name: string } | null }) {
  return it.poi?.name || it.customName || "未命名";
}

export async function getTripReview(tripId: string): Promise<TripReview | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { date: "asc" },
        include: {
          items: {
            orderBy: { seq: "asc" },
            include: { poi: true, legToNext: true },
          },
        },
      },
      expenses: {
        orderBy: { date: "asc" },
        include: { splits: true },
      },
    },
  });
  if (!trip) return null;

  let stopCount = 0;
  let distM = 0;
  let durMin = 0;
  let hasDist = false;
  let hasDur = false;

  const days = trip.days.map((d) => {
    stopCount += d.items.length;
    for (const it of d.items) {
      if (it.legToNext?.distanceM != null) {
        distM += it.legToNext.distanceM;
        hasDist = true;
      }
      if (it.legToNext?.durationMin != null) {
        durMin += it.legToNext.durationMin;
        hasDur = true;
      }
    }
    return {
      date: dateKey(d.date),
      stops: d.items.map((it) => ({
        name: itemName(it),
        startTime: it.startTime,
      })),
    };
  });

  const spendByCategory: Record<string, number> = {};
  let spendTotal = 0;
  let othersOweMe = 0;
  const photos: TripReview["photos"] = [];

  for (const e of trip.expenses) {
    spendTotal += e.amount;
    spendByCategory[e.category] = (spendByCategory[e.category] ?? 0) + e.amount;
    const mySplit = e.splits.find((s) => s.member === "我");
    const myRatio = mySplit?.ratio ?? 0;
    const ratioSum = e.splits.reduce((a, s) => a + s.ratio, 0) || 1;
    const myShare = e.amount * (myRatio / ratioSum);
    othersOweMe += Math.max(0, e.amount - myShare);
    if (e.receiptExt) {
      photos.push({
        expenseId: e.id,
        note: e.note,
        category: e.category,
        amount: e.amount,
        date: dateKey(e.date),
      });
    }
  }

  return {
    tripId: trip.id,
    title: trip.title,
    startDate: dateKey(trip.startDate),
    endDate: dateKey(trip.endDate),
    dayCount: trip.days.length,
    stopCount,
    legDistanceKm: hasDist ? Math.round((distM / 1000) * 10) / 10 : null,
    legDurationMin: hasDur ? durMin : null,
    spendTotal: Math.round(spendTotal * 100) / 100,
    spendByCategory,
    othersOweMe: Math.round(othersOweMe * 100) / 100,
    days,
    photos,
  };
}
