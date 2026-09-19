import { heuristicAdjustOps } from "./ai.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const trip = {
  days: [
    {
      id: "d0",
      date: new Date("2026-09-20T12:00:00.000Z"),
      items: [
        { id: "i1", customName: null, startTime: "09:00", poi: { name: "宽窄巷子" } },
        { id: "i2", customName: null, startTime: "14:00", poi: { name: "成都大熊猫繁育研究基地" } },
      ],
    },
    {
      id: "d1",
      date: new Date("2026-09-21T12:00:00.000Z"),
      items: [{ id: "i3", customName: "锦里", startTime: "10:00", poi: null }],
    },
  ],
};

const move = heuristicAdjustOps("把熊猫基地改到第2天", trip);
assert(move.length === 1 && move[0]!.op === "move", "move");
assert(move[0]!.op === "move" && move[0]!.itemId === "i2" && move[0]!.toDayIndex === 1, "move target");

const del = heuristicAdjustOps("删除锦里", trip);
assert(del.length === 1 && del[0]!.op === "remove" && del[0]!.itemId === "i3", "remove");

const time = heuristicAdjustOps("把宽窄巷子改到15:30", trip);
assert(
  time.length === 1 && time[0]!.op === "setTime" && time[0]!.itemId === "i1" && time[0]!.startTime === "15:30",
  "time",
);

console.log("ai adjust heuristic selfcheck ok");
