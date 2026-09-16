import { heuristicNames, heuristicRestaurantNames } from "./ai.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const a = heuristicNames("宽窄巷子\n大熊猫基地\n锦里");
assert(a.includes("宽窄巷子") && a.includes("锦里"), "newline split");

const b = heuristicNames("上午去宽窄巷子，中午锦里吃饭，下午春熙路");
assert(b.some((x) => x.includes("宽窄")), "顿号句内");
assert(b.some((x) => x.includes("锦里") || x.includes("春熙")), "句内地名");

const c = heuristicNames("《三星堆博物馆》然后去都江堰");
assert(c.includes("三星堆博物馆"), "书名号");

const d = heuristicNames("09:00 宽窄巷子 → 大熊猫基地");
assert(d.some((x) => !x.startsWith("09")), "strip time");
assert(d.length >= 2, "arrow path");

const r = heuristicRestaurantNames("推荐「马路边边火锅」人均120\n三星堆博物馆别去吃饭\n蜀大侠火锅店不错");
assert(r.some((x) => x.includes("马路边边") || x.includes("火锅")), "dianping shop");
assert(r.some((x) => x.includes("蜀大侠")), "suffix shop");
assert(!r.includes("三星堆博物馆"), "skip scenic");

console.log("ai heuristic selfcheck ok", { a, b, c, d, r });
