/**
 * 预算预计合计：分位四舍五入；共同入账后按 myShare 计入总额。
 */
import { planMyAmount, planTotal } from "./budget.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(planTotal([]) === 0, "empty");
assert(planTotal([10, 20.5]) === 30.5, "sum");
assert(planTotal([0.1, 0.2]) === 0.3, "float cents");

assert(
  planMyAmount({ amount: 906.77, implanted: false, myShare: null }) === 906.77,
  "open uses bill",
);
assert(
  planMyAmount({ amount: 906.77, implanted: true, myShare: 453.39 }) === 453.39,
  "shared uses myShare",
);
assert(
  planMyAmount({ amount: 100, implanted: true, myShare: null }) === 100,
  "implanted fallback",
);

/** 未入账在前、已入账垫底（与 list orderBy 一致） */
function sortPlans<T extends { implanted: boolean; id: string }>(rows: T[]) {
  return [...rows].sort((a, b) => Number(a.implanted) - Number(b.implanted) || a.id.localeCompare(b.id));
}
const sorted = sortPlans([
  { id: "b", implanted: true },
  { id: "a", implanted: false },
  { id: "c", implanted: true },
]);
assert(sorted.map((x) => x.id).join("") === "abc", "open then done");
console.log("budget plan selfcheck ok");
