import { classifyTrafficDay, todayKeyShanghai } from "./info.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const today = "2026-09-16";
assert(classifyTrafficDay("2026-09-16", today) === "today", "today");
assert(classifyTrafficDay("2026-09-17", today) === "future", "future");
assert(classifyTrafficDay("2026-09-15", today) === "past", "past");

const key = todayKeyShanghai(new Date("2026-09-16T02:00:00.000Z"));
assert(key === "2026-09-16", `shanghai key got ${key}`);

console.log("traffic day selfcheck ok");
