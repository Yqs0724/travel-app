import { pickTransit, polylineFromTransit, transitHasSubway } from "./amap.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const busOnly = {
  duration: "1200",
  distance: "3000",
  segments: [{ bus: { buslines: [{ name: "56路", type: "普通公交", polyline: "104.06,30.67;104.07,30.68" }] } }],
};
const withMetro = {
  duration: "900",
  distance: "5000",
  cost: "4",
  segments: [
    { walking: { steps: [{ polyline: "104.05,30.66;104.051,30.661" }] } },
    { bus: { buslines: [{ name: "地铁1号线", type: "地铁线路", polyline: "104.05,30.66;104.08,30.67" }] } },
  ],
};

assert(transitHasSubway(withMetro), "metro detect");
assert(!transitHasSubway(busOnly), "bus only");

const picked = pickTransit([busOnly, withMetro], true);
assert(picked === withMetro, "prefer subway picks metro");
assert(pickTransit([busOnly, withMetro], false) === busOnly, "bus mode takes first");

const poly = polylineFromTransit(withMetro);
assert(poly.length >= 3, "polyline from walk+metro");
assert(poly[0]![0] === 104.05, "first lng");

console.log("amap transit selfcheck ok");
