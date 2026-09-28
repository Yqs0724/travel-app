/**
 * 旅行回顾：我承担 / 文案摘要。
 */
import { buildReviewSummaryText, type TripReview } from "./review.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const sample: TripReview = {
  tripId: "t",
  title: "成都",
  startDate: "2026-10-03",
  endDate: "2026-10-09",
  dayCount: 7,
  stopCount: 2,
  legDistanceKm: 12.3,
  legDurationMin: 90,
  mySpend: 450,
  paidOut: 900,
  spendByCategory: { hotel: 450 },
  othersOweMe: 450,
  budget: { planMine: 500, openBill: 50, openCount: 1, doneCount: 1 },
  days: [
    { date: "2026-10-03", stops: [{ name: "宽窄巷子", startTime: null }] },
    { date: "2026-10-04", stops: [] },
  ],
  photos: [],
};

const text = buildReviewSummaryText(sample);
assert(text.includes("成都"), "title");
assert(text.includes("我承担 ¥450.00"), "mySpend");
assert(text.includes("朋友应付我 ¥450.00"), "owe");
assert(text.includes("第 1 天"), "day");
assert(text.includes("宽窄巷子"), "stop");
assert(text.includes("未入账 ¥50.00"), "budget open");
console.log("review selfcheck ok");
