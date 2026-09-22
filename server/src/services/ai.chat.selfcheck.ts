import { heuristicChat, type TripChatContext } from "./ai.chat.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ctx: TripChatContext = {
  title: "成都",
  dateRange: "2026-10-03 ~ 2026-10-09",
  days: [{ label: "第1天", stops: ["宽窄巷子"] }],
  checklist: [
    { name: "身份证", purchased: true, checked: true, category: "证件" },
    { name: "酒精消毒液", purchased: false, checked: false, category: "洗漱" },
    { name: "雨伞", purchased: true, checked: false, category: "其他" },
  ],
  expenseCount: 2,
  expenseSum: 128,
};

const alcohol = heuristicChat(ctx, "检查清单里是否有酒精");
assert(alcohol, "alcohol");
assert(/酒精消毒液/.test(alcohol.reply), alcohol.reply);
assert(alcohol.links.some((l) => l.page === "checklist"), "checklist link");

const missing = heuristicChat(ctx, "清单里有没有羽绒服");
assert(missing && /没有/.test(missing.reply), "missing");

const extract = heuristicChat(ctx, "帮我从笔记提取地点");
assert(extract?.handoff === "extract", "extract");

console.log("ai.chat selfcheck ok");
