import { prisma } from "../lib/prisma.js";
import { planMyAmount } from "./budget.service.js";

export type TripReview = {
  tripId: string;
  title: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  stopCount: number;
  legDistanceKm: number | null;
  legDurationMin: number | null;
  /** 我承担（分摊后） */
  mySpend: number;
  /** 我掏出去的账单合计（含代付朋友份） */
  paidOut: number;
  spendByCategory: Record<string, number>;
  othersOweMe: number;
  budget: {
    /** 预算按「我付」合计 */
    planMine: number;
    /** 未入账账单额合计 */
    openBill: number;
    openCount: number;
    doneCount: number;
  } | null;
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

function memberShare(
  amount: number,
  splits: Array<{ member: string; ratio: number }>,
  member: string,
): number {
  const ratioSum = splits.reduce((s, x) => s + x.ratio, 0);
  if (ratioSum <= 0) return 0;
  const mine = splits.find((s) => s.member === member)?.ratio ?? 0;
  return (amount * mine) / ratioSum;
}

export function buildReviewSummaryText(r: TripReview): string {
  const lines: string[] = [];
  lines.push(`${r.title}`);
  lines.push(
    r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`,
  );
  const bits = [`${r.dayCount} 天`, `${r.stopCount} 站`];
  if (r.legDistanceKm != null) bits.push(`${r.legDistanceKm} km`);
  lines.push(bits.join(" · "));
  lines.push(`我承担 ¥${r.mySpend.toFixed(2)}`);
  if (r.othersOweMe > 0) lines.push(`朋友应付我 ¥${r.othersOweMe.toFixed(2)}`);
  if (r.budget && (r.budget.openCount > 0 || r.budget.doneCount > 0)) {
    lines.push(`预算（我付）¥${r.budget.planMine.toFixed(2)}`);
    if (r.budget.openCount > 0) {
      lines.push(`未入账 ¥${r.budget.openBill.toFixed(2)}`);
    }
  }
  lines.push("");
  r.days.forEach((d, i) => {
    lines.push(`第 ${i + 1} 天 · ${d.date.slice(5)}`);
    if (d.stops.length === 0) lines.push("  （空）");
    else d.stops.forEach((s) => lines.push(`  · ${s.name}`));
  });
  return lines.join("\n");
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
      budgetPlans: { orderBy: [{ implanted: "asc" }, { id: "asc" }] },
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
  let mySpend = 0;
  let paidOut = 0;
  let othersOweMe = 0;
  const photos: TripReview["photos"] = [];
  const me = "我";

  for (const e of trip.expenses) {
    paidOut += e.amount;
    const mine = memberShare(e.amount, e.splits, me);
    mySpend += mine;
    othersOweMe += Math.max(0, e.amount - mine);
    spendByCategory[e.category] = (spendByCategory[e.category] ?? 0) + mine;
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

  for (const k of Object.keys(spendByCategory)) {
    spendByCategory[k] = Math.round(spendByCategory[k] * 100) / 100;
  }

  let budget: TripReview["budget"] = null;
  if (trip.budgetPlans.length > 0) {
    let planMine = 0;
    let openBill = 0;
    let openCount = 0;
    let doneCount = 0;
    for (const p of trip.budgetPlans) {
      planMine += planMyAmount(p);
      if (p.implanted) doneCount += 1;
      else {
        openCount += 1;
        openBill += p.amount;
      }
    }
    budget = {
      planMine: Math.round(planMine * 100) / 100,
      openBill: Math.round(openBill * 100) / 100,
      openCount,
      doneCount,
    };
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
    mySpend: Math.round(mySpend * 100) / 100,
    paidOut: Math.round(paidOut * 100) / 100,
    spendByCategory,
    othersOweMe: Math.round(othersOweMe * 100) / 100,
    budget,
    days,
    photos,
  };
}
