import { settle } from "./settlement.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const t = settle([
  {
    amount: 100,
    payer: "A",
    splits: [
      { member: "A", ratio: 1 },
      { member: "B", ratio: 1 },
    ],
  },
]);
assert(t.length === 1 && t[0]!.from === "B" && t[0]!.to === "A" && t[0]!.amount === 50, "AB 均摊");

const t2 = settle([
  {
    amount: 90,
    payer: "A",
    splits: [
      { member: "A", ratio: 1 },
      { member: "B", ratio: 1 },
      { member: "C", ratio: 1 },
    ],
  },
  {
    amount: 30,
    payer: "B",
    splits: [
      { member: "A", ratio: 1 },
      { member: "B", ratio: 1 },
      { member: "C", ratio: 1 },
    ],
  },
]);
assert(t2.length === 2, "三人两笔转账");
const cToA = t2.find((x) => x.from === "C" && x.to === "A");
const bToA = t2.find((x) => x.from === "B" && x.to === "A");
assert(cToA?.amount === 40, "C→A 40");
assert(bToA?.amount === 10, "B→A 10");

/** 我的代付账本：个人支出不产生转账 */
const personal = settle([
  {
    amount: 72,
    payer: "我",
    splits: [{ member: "我", ratio: 1 }],
  },
]);
assert(personal.length === 0, "个人门票无转账");

/** 共同：我付 200，与朋友均分 → 朋友应付我 100 */
const shared = settle([
  {
    amount: 200,
    payer: "我",
    splits: [
      { member: "我", ratio: 1 },
      { member: "朋友A", ratio: 1 },
    ],
  },
]);
assert(
  shared.length === 1 &&
    shared[0]!.from === "朋友A" &&
    shared[0]!.to === "我" &&
    shared[0]!.amount === 100,
  "共同支出朋友应付我",
);

console.log("settlement check ok");
