import { buildSuggestions } from "./checklist.suggest.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const rain = buildSuggestions({
  poiBlob: "宽窄巷子",
  modes: ["walk"],
  weatherBlob: "中雨 阴",
  temps: [22, 18],
  existingNames: [],
});
assert(rain.some((x) => x.name.includes("雨伞")), "rain umbrella");

const hike = buildSuggestions({
  poiBlob: "青城山 登山",
  modes: ["drive"],
  weatherBlob: "晴",
  temps: [25, 16],
  existingNames: ["登山鞋 / 防滑运动鞋"],
});
assert(!hike.some((x) => x.name.includes("登山鞋")), "dedupe existing");
assert(hike.some((x) => x.name.includes("背包")), "backpack still");

const flight = buildSuggestions({
  poiBlob: "双流国际机场",
  modes: ["flight"],
  weatherBlob: "晴",
  temps: [28, 20],
  existingNames: [],
});
assert(flight.some((x) => x.reason.includes("乘机")), "flight rule");

console.log("checklist suggest selfcheck ok");
