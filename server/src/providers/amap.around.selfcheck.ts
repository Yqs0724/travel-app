import { mapPoiRows } from "./amap.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const hits = mapPoiRows([
  {
    id: "B1",
    name: "公厕",
    location: "104.06,30.67",
    cityname: "成都",
    type: "公共设施;公厕",
    address: "某路1号",
    distance: "120.4",
  },
  {
    id: "bad",
    name: "无坐标",
    location: "",
    distance: "10",
  },
]);

assert(hits.length === 1, "skip invalid location");
assert(hits[0]!.amapId === "B1", "id");
assert(hits[0]!.distanceM === 120, "round distance");
assert(hits[0]!.category === "公共设施", "category first segment");
assert(mapPoiRows([]).length === 0, "empty");

console.log("amap around selfcheck ok");
