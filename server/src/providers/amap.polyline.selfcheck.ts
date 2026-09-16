import { parseAmapPolyline } from "./amap.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const pts = parseAmapPolyline("104.06,30.67;104.07,30.68;104.08,30.69");
assert(pts.length === 3, "3 points");
assert(pts[0]![0] === 104.06 && pts[0]![1] === 30.67, "first");
assert(parseAmapPolyline("").length === 0, "empty");
assert(parseAmapPolyline("bad;1,2").length === 1, "skip bad");

console.log("amap polyline selfcheck ok");
