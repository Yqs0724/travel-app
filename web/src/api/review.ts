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
  /** 我承担（分摊后） */
  mySpend: number;
  /** 我掏出去的账单合计 */
  paidOut: number;
  spendByCategory: Record<string, number>;
  othersOweMe: number;
  budget: {
    planMine: number;
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

export function getTripReview(tripId: string) {
  return api<TripReview>(`/api/v1/trips/${tripId}/review`);
}

export function reviewSummaryText(r: TripReview): string {
  const lines: string[] = [];
  lines.push(`${r.title}`);
  lines.push(r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`);
  const bits = [`${r.dayCount} 天`, `${r.stopCount} 站`];
  if (r.legDistanceKm != null) bits.push(`${r.legDistanceKm} km`);
  lines.push(bits.join(" · "));
  lines.push(`我承担 ¥${r.mySpend.toFixed(2)}`);
  if (r.othersOweMe > 0) lines.push(`朋友应付我 ¥${r.othersOweMe.toFixed(2)}`);
  if (r.budget && (r.budget.openCount > 0 || r.budget.doneCount > 0)) {
    lines.push(`预算（我付）¥${r.budget.planMine.toFixed(2)}`);
    if (r.budget.openCount > 0) lines.push(`未入账 ¥${r.budget.openBill.toFixed(2)}`);
  }
  lines.push("");
  r.days.forEach((d, i) => {
    lines.push(`第 ${i + 1} 天 · ${d.date.slice(5)}`);
    if (d.stops.length === 0) lines.push("  （空）");
    else d.stops.forEach((s) => lines.push(`  · ${s.name}`));
  });
  return lines.join("\n");
}
