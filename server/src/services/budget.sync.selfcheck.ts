/**
 * 行程估价不再自动灌账；本文件仅保留「模型已退役」断言，防止误加回 sync。
 * 个人/共同结算见 settlement.selfcheck.ts
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(true, "budget auto-sync retired");
console.log("budget sync retired selfcheck ok");
