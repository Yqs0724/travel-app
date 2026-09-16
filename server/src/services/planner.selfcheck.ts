/** 时间顺延小检查：与 planner.service cascade 算法一致 */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(wrapped / 60);
  const nm = wrapped % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(addMinutes("09:00", 90) === "10:30", "09:00+90");
assert(addMinutes("23:30", 60) === "00:30", "跨日 wrap");
console.log("planner time check ok");
