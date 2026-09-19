import { assignPoisToDays, heuristicNames, heuristicRestaurantNames } from "./ai.service.js";

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

const note =
  "咱们就4号：成都博物馆、三星堆（需要讲解）；5号:都江堰、青城山；6号:武侯祠（需要讲解）、杜甫草堂（可以当天只去武侯祠） 然后从成都东坐动车到黄山九寨";
const dates = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];
const named = (name: string) => ({ name });
const buckets = assignPoisToDays(
  [
    named("成都东站"),
    named("黄山风景区"),
    named("成都武侯祠博物馆"),
    named("成都博物馆"),
    named("青城山景区"),
    named("成都杜甫草堂博物馆"),
    named("都江堰景区"),
    named("三星堆博物馆"),
  ],
  dates,
  note,
);
assert(buckets, "dated note should not fall back to geo cluster");
const namesOn = (i: number) => buckets![i]!.map((p) => p.name);
assert(namesOn(0).length === 0, `10-03 empty, got ${namesOn(0)}`);
assert(namesOn(1).join(",") === "成都博物馆,三星堆博物馆", `10-04 ${namesOn(1)}`);
assert(namesOn(2).join(",") === "都江堰景区,青城山景区", `10-05 ${namesOn(2)}`);
assert(namesOn(3).join(",") === "成都武侯祠博物馆,成都杜甫草堂博物馆", `10-06 ${namesOn(3)}`);
assert(namesOn(4).includes("成都东站") && namesOn(4).includes("黄山风景区"), `10-07 ${namesOn(4)}`);
assert(assignPoisToDays([named("锦里")], dates, "随便逛锦里") === null, "no day marker");

console.log("ai heuristic selfcheck ok", { a, b, c, d, r, days: namesOn(1) });
