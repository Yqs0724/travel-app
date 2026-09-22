import { prisma } from "../lib/prisma.js";
import * as llm from "../providers/llm.js";

export type ChatLinkPage = "plan" | "checklist" | "budget" | "nearby" | "review";

export type ChatLink = { label: string; page: ChatLinkPage };

export type ChatHandoff = "extract" | "adjust" | null;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  reply: string;
  links: ChatLink[];
  handoff: ChatHandoff;
  source: "llm" | "rules";
};

const PAGES = new Set<ChatLinkPage>(["plan", "checklist", "budget", "nearby", "review"]);

const PAGE_LABEL: Record<ChatLinkPage, string> = {
  plan: "去行程",
  checklist: "去清单",
  budget: "去记账",
  nearby: "去周边",
  review: "去点评",
};

export type TripChatContext = {
  title: string;
  dateRange: string;
  days: Array<{ label: string; stops: string[] }>;
  checklist: Array<{ name: string; purchased: boolean; checked: boolean; category: string }>;
  expenseCount: number;
  expenseSum: number;
};

export async function loadTripChatContext(tripId: string): Promise<TripChatContext> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { date: "asc" },
        include: {
          items: { orderBy: { seq: "asc" }, include: { poi: true } },
        },
      },
      checklist: { orderBy: { id: "asc" } },
      expenses: true,
    },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const days = trip.days.map((d, i) => ({
    label: `第${i + 1}天 ${d.date.toISOString().slice(0, 10)}`,
    stops: d.items.map((it) => it.poi?.name || it.customName || "未命名"),
  }));

  return {
    title: trip.title,
    dateRange: `${trip.startDate.toISOString().slice(0, 10)} ~ ${trip.endDate.toISOString().slice(0, 10)}`,
    days,
    checklist: trip.checklist.map((c) => ({
      name: c.name,
      purchased: c.purchased,
      checked: c.checked,
      category: c.category,
    })),
    expenseCount: trip.expenses.length,
    expenseSum: trip.expenses.reduce((s, e) => s + (e.amount ?? 0), 0),
  };
}

function formatContext(ctx: TripChatContext): string {
  const dayLines = ctx.days
    .map((d) => `${d.label}：${d.stops.length ? d.stops.join(" → ") : "（空）"}`)
    .join("\n");
  const pack = ctx.checklist.length
    ? ctx.checklist
        .map((c) => {
          const flags = [c.purchased ? "已购" : null, c.checked ? "已带" : null].filter(Boolean).join("/");
          return `${flags ? `[${flags}]` : "[ ]"} ${c.name}（${c.category}）`;
        })
        .join("、")
    : "（清单为空）";
  return [
    `行程「${ctx.title}」 ${ctx.dateRange}`,
    dayLines || "（尚无日程）",
    `清单：${pack}`,
    `账单条目 ${ctx.expenseCount} 笔，合计约 ${Math.round(ctx.expenseSum)} 元`,
  ].join("\n");
}

function normalizeLinks(raw: unknown): ChatLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatLink[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const page = String((item as { page?: string }).page ?? "") as ChatLinkPage;
    if (!PAGES.has(page) || seen.has(page)) continue;
    seen.add(page);
    const label =
      typeof (item as { label?: string }).label === "string" && (item as { label: string }).label.trim()
        ? (item as { label: string }).label.trim().slice(0, 20)
        : PAGE_LABEL[page];
    out.push({ label, page });
  }
  return out.slice(0, 4);
}

function normalizeHandoff(raw: unknown): ChatHandoff {
  if (raw === "extract" || raw === "adjust") return raw;
  return null;
}

/** 无 LLM 时的站内问答（清单命中、跳转建议） */
export function heuristicChat(ctx: TripChatContext, message: string): ChatResult | null {
  const m = message.trim();
  if (!m) return null;

  if (/(?:贴|提取|笔记|小红书|点评|截图).*(?:地点|攻略)|提取地点|帮我排/.test(m)) {
    return {
      reply: "可以把笔记或截图丢进「行程助手」，我帮你抽地点并排进行程。",
      links: [{ label: PAGE_LABEL.plan, page: "plan" }],
      handoff: "extract",
      source: "rules",
    };
  }

  if (/(?:改到|调到|移到|放到|挪到)\s*第?\s*\d+\s*天|删除|去掉|移除/.test(m)) {
    return {
      reply: "这像是在改行程。点下方确认后我会生成可应用的调整方案。",
      links: [{ label: PAGE_LABEL.plan, page: "plan" }],
      handoff: "adjust",
      source: "rules",
    };
  }

  if (/清单|行李|带了|有没有|是否有|检查.*带|打包/.test(m)) {
    const needle = m
      .replace(/检查|清单|里|里面|是否有|有没有|带了吗?|带了没|吗|呢|？|\?|请|帮我|看下|看看/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = needle
      ? needle.split(/\s+/).filter((t) => t.length >= 1)
      : [];
    const hits = ctx.checklist.filter((c) => {
      const name = c.name.toLowerCase();
      if (tokens.length === 0) return false;
      return tokens.some((t) => name.includes(t.toLowerCase()) || t.toLowerCase().includes(name));
    });
    // 常见别名：酒精 ↔ 酒
    const extra = ctx.checklist.filter((c) => {
      if (/酒精|酒|白酒|啤酒|红酒/.test(m) && /酒|酒精/.test(c.name)) return true;
      if (/雨伞|伞/.test(m) && /伞/.test(c.name)) return true;
      if (/充电宝|电源/.test(m) && /充电|电源/.test(c.name)) return true;
      return false;
    });
    const merged = [...new Map([...hits, ...extra].map((c) => [c.name, c])).values()];

    if (merged.length) {
      const lines = merged
        .map((c) => {
          const flags = [c.purchased ? "已购" : "未购", c.checked ? "已带" : "未带"].join("·");
          return `· ${c.name}（${flags}）`;
        })
        .join("\n");
      return {
        reply: `清单里找到相关项：\n${lines}`,
        links: [{ label: PAGE_LABEL.checklist, page: "checklist" }],
        handoff: null,
        source: "rules",
      };
    }
    if (ctx.checklist.length === 0) {
      return {
        reply: "这趟行程清单还是空的，可以去清单页从模板添加。",
        links: [{ label: PAGE_LABEL.checklist, page: "checklist" }],
        handoff: null,
        source: "rules",
      };
    }
    return {
      reply: needle
        ? `清单里没有明显叫「${needle}」的项。当前共 ${ctx.checklist.length} 项，可去清单页核对。`
        : `清单里共 ${ctx.checklist.length} 项。可以说具体物品名称，例如「有没有雨伞」。`,
      links: [{ label: PAGE_LABEL.checklist, page: "checklist" }],
      handoff: null,
      source: "rules",
    };
  }

  if (/记账|花了|AA|预算|多少钱/.test(m)) {
    return {
      reply: `当前账本约 ${ctx.expenseCount} 笔、合计约 ${Math.round(ctx.expenseSum)} 元。细节在记账页。`,
      links: [{ label: PAGE_LABEL.budget, page: "budget" }],
      handoff: null,
      source: "rules",
    };
  }

  if (/第\s*\d+\s*天|行程|路线|去哪|日程/.test(m)) {
    const summary =
      ctx.days
        .slice(0, 5)
        .map((d) => `${d.label}：${d.stops.slice(0, 4).join("、") || "空"}`)
        .join("\n") || "还没有安排日程。";
    return {
      reply: summary,
      links: [{ label: PAGE_LABEL.plan, page: "plan" }],
      handoff: null,
      source: "rules",
    };
  }

  return null;
}

function parseLlmChat(raw: unknown): ChatResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply.trim() : "";
  if (!reply) return null;
  return {
    reply: reply.slice(0, 4000),
    links: normalizeLinks(o.links),
    handoff: normalizeHandoff(o.handoff),
    source: "llm",
  };
}

export async function chatAboutTrip(
  tripId: string,
  message: string,
  history: ChatTurn[] = [],
): Promise<ChatResult> {
  const ctx = await loadTripChatContext(tripId);
  const text = message.trim();
  if (!text) throw Object.assign(new Error("请输入内容"), { code: 40001 });

  // 明确改行程 / 抽地点：规则优先，少一轮 LLM
  const ruleFirst = heuristicChat(ctx, text);
  if (ruleFirst && (ruleFirst.handoff === "extract" || ruleFirst.handoff === "adjust")) {
    return ruleFirst;
  }
  if (ruleFirst && /清单|行李|有没有|是否有/.test(text)) {
    // 清单类问题规则够准，直接返回
    return ruleFirst;
  }

  const hist = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "用户" : "助手"}：${t.content.slice(0, 500)}`)
    .join("\n");

  const system = `你是旅行 App「行迹」的行程副驾驶。只根据给定的本行程数据回答，不要假装搜过全网（联网以后再做）。
用简洁中文。若涉及清单/行程/记账/周边，在 links 里给出跳转（page 只能是 plan|checklist|budget|nearby|review）。
若用户想粘贴笔记/截图抽地点，handoff 设为 "extract"。
若用户明确要求改日程（移到第N天、删除某站等），handoff 设为 "adjust"。
否则 handoff 为 null。
严格输出 JSON：{"reply":"string","links":[{"label":"去清单","page":"checklist"}],"handoff":null}`;

  const user = `【本行程】\n${formatContext(ctx)}\n\n【近况】\n${hist || "（无）"}\n\n【用户】\n${text}`;

  try {
    const raw = await llm.chatJsonRetry(system, user);
    const parsed = parseLlmChat(raw);
    if (parsed) {
      // 清单问句若模型没给链接，补上
      if (/清单|有没有|是否有/.test(text) && !parsed.links.some((l) => l.page === "checklist")) {
        parsed.links.push({ label: PAGE_LABEL.checklist, page: "checklist" });
      }
      return parsed;
    }
  } catch {
    /* fall through */
  }

  return (
    ruleFirst ?? {
      reply:
        "我暂时没法调用大模型。你可以问清单里有没有某样东西、某天行程，或用下方「行程助手」贴笔记抽地点。",
      links: [
        { label: PAGE_LABEL.plan, page: "plan" },
        { label: PAGE_LABEL.checklist, page: "checklist" },
      ],
      handoff: null,
      source: "rules",
    }
  );
}
