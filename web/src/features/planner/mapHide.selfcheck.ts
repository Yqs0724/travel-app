import { mapVisible, spanSkipsHidden } from "./mapHide.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const items = [
  { seq: 0, mapHidden: false, poi: { lng: 1, lat: 2 } },
  { seq: 1, mapHidden: true, poi: { lng: 3, lat: 4 } },
  { seq: 2, mapHidden: false, poi: { lng: 5, lat: 6 } },
  { seq: 3, mapHidden: false, poi: null },
];

const vis = mapVisible(items);
assert(vis.length === 2 && vis[0]!.seq === 0 && vis[1]!.seq === 2, "hidden and no-coord dropped");
assert(spanSkipsHidden(items, 0, 2), "gap has a hidden stop");
assert(!spanSkipsHidden(items, 0, 1), "adjacent is a stored leg");

console.log("map hide selfcheck ok");
