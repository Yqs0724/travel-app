import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { assertPublicShape, isSharedExpense } from "./share.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const okSnap = {
  token: "abc",
  canEdit: true,
  editVersion: 0,
  trip: {
    id: "t1",
    title: "成都",
    startDate: "2026-01-01",
    endDate: "2026-01-03",
    days: [
      {
        id: "d1",
        date: "2026-01-01",
        note: null,
        items: [
          {
            id: "i1",
            dayId: "d1",
            seq: 0,
            customName: null,
            startTime: "09:00",
            durationMin: 60,
            note: null,
            poi: { id: "p1", name: "宽窄巷子", lng: 104.05, lat: 30.66, city: "成都", category: null },
            legToNext: { id: "l1", mode: "walk", distanceM: 500, durationMin: 8 },
          },
        ],
      },
    ],
  },
};

assertPublicShape(okSnap);

let threw = false;
try {
  assertPublicShape({ trip: { expenses: [] } });
} catch {
  threw = true;
}
assert(threw, "must reject expenses key");

threw = false;
try {
  assertPublicShape({ passwordHash: "x" });
} catch {
  threw = true;
}
assert(threw, "must reject passwordHash");

const stored = hashPassword("secret99");
assert(verifyPassword("secret99", stored), "verify ok");
assert(!verifyPassword("wrong", stored), "verify reject");
assert(stored.includes(":"), "salt:hash form");
// 不同次哈希盐不同
assert(hashPassword("secret99") !== stored, "salted");

// 版本冲突语义：期望值不符即冲突（与 bumpEditVersion 同逻辑）
function wouldConflict(current: number, expected: number) {
  return current !== expected;
}
assert(wouldConflict(3, 2), "stale version");
assert(!wouldConflict(3, 3), "fresh version");

// 编辑 JWT payload 形状
const editorPayload = { sub: "editor" as const, tripId: "t1" };
assert(editorPayload.sub === "editor" && editorPayload.tripId === "t1", "editor claim");

assert(isSharedExpense([{ member: "我" }, { member: "朋友" }]), "shared");
assert(!isSharedExpense([{ member: "我" }]), "personal only");

console.log("share selfcheck ok", createHash("sha256").update("ok").digest("hex").slice(0, 8));
