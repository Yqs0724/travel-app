import { titleFromMessage } from "./chatHistory";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(titleFromMessage("检查清单里是否有酒精").startsWith("检查清单"), "title");
assert(titleFromMessage("   ").length > 0, "empty fallback");
console.log("chatHistory selfcheck ok");
