import { computeBookingReminders, formatBookRemindAt, isAbnormalWeather } from "./info.service.js";

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

assert(formatBookRemindAt("2026-09-22T18:00") === "9.22 18:00", "fmt");

const today = "2026-09-16";
const list = computeBookingReminders(
  [
    {
      id: "i1",
      dayId: "d1",
      dayDate: new Date("2026-09-20T12:00:00.000Z"),
      needBook: true,
      bookAheadDays: 7,
      bookRemindAt: null,
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
      bookRemindAt: null,
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
      bookRemindAt: null,
      bookUrl: null,
      customName: "跳过",
      poiName: null,
    },
    {
      id: "i4",
      dayId: "d1",
      dayDate: new Date("2026-09-23T12:00:00.000Z"),
      needBook: true,
      bookAheadDays: null,
      bookRemindAt: "2026-09-16T18:00",
      bookUrl: "公众号：三星堆预约",
      customName: null,
      poiName: "精确时刻",
    },
  ],
  today,
);

assert(list.length === 3, "only needBook");
const a = list.find((x) => x.itemId === "i1")!;
assert(a.remindOn === "2026-09-13" && a.status === "overdue", "i1 overdue");
const b = list.find((x) => x.itemId === "i2")!;
assert(b.remindOn === "2026-09-16" && b.status === "due", "i2 due");
const c = list.find((x) => x.itemId === "i4")!;
assert(c.remindOn === "2026-09-16" && c.status === "due" && c.bookRemindAt === "2026-09-16T18:00", "i4 at");
assert(c.bookAheadDays === 7, "i4 ahead from date");

console.log("info selfcheck ok");
