import { computeBookingReminders, isAbnormalWeather } from "./info.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  isAbnormalWeather({ dayWeather: "暴雨", nightWeather: "阴", dayTemp: 28, nightTemp: 22 }),
  "storm",
);
assert(
  isAbnormalWeather({ dayWeather: "晴", nightWeather: "晴", dayTemp: 37, nightTemp: 28 }),
  "hot",
);
assert(
  !isAbnormalWeather({ dayWeather: "晴", nightWeather: "多云", dayTemp: 26, nightTemp: 18 }),
  "ok",
);

const today = "2026-09-16";
const list = computeBookingReminders(
  [
    {
      id: "i1",
      dayId: "d1",
      dayDate: new Date("2026-09-20T12:00:00.000Z"),
      needBook: true,
      bookAheadDays: 7,
      bookUrl: "https://example.com",
      customName: null,
      poiName: "三星堆",
    },
    {
      id: "i2",
      dayId: "d1",
      dayDate: new Date("2026-09-18T12:00:00.000Z"),
      needBook: true,
      bookAheadDays: 2,
      bookUrl: null,
      customName: "手工点",
      poiName: null,
    },
    {
      id: "i3",
      dayId: "d2",
      dayDate: new Date("2026-09-25T12:00:00.000Z"),
      needBook: false,
      bookAheadDays: 3,
      bookUrl: null,
      customName: "跳过",
      poiName: null,
    },
  ],
  today,
);

assert(list.length === 2, "only needBook");
const a = list.find((x) => x.itemId === "i1")!;
assert(a.remindOn === "2026-09-13" && a.status === "overdue", "i1 overdue");
const b = list.find((x) => x.itemId === "i2")!;
assert(b.remindOn === "2026-09-16" && b.status === "due", "i2 due");

console.log("info selfcheck ok");
