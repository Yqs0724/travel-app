import { heuristicNames } from "./ai.service.js";

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

console.log("ai heuristic selfcheck ok", { a, b, c, d });
