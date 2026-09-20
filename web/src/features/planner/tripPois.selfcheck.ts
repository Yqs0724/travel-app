import { tripPoiHits } from "./tripPois";
import type { ItineraryItem } from "@/api/planner";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const hotel = {
  id: "p1",
  amapId: "A1",
  name: "金陵酒店",
  lng: 104.06,
  lat: 30.65,
  city: "成都",
  category: null,
};
const station = {
  id: "p2",
  amapId: "A2",
  name: "成都东站",
  lng: 104.14,
  lat: 30.63,
  city: "成都",
  category: null,
};

const days = [
  {
    items: [
      { poi: hotel } as ItineraryItem,
      { poi: null } as ItineraryItem,
    ],
  },
  {
    items: [
      { poi: { ...hotel } } as ItineraryItem, // 同 amapId 去重
      { poi: station } as ItineraryItem,
    ],
  },
];

const hits = tripPoiHits(days);
assert(hits.length === 2, `expect 2 got ${hits.length}`);
assert(hits[0]!.name === "金陵酒店", "hotel first");
assert(hits[1]!.name === "成都东站", "station");
console.log("tripPois selfcheck ok");
