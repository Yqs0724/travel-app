import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import * as amap from "../providers/amap.js";
import * as llm from "../providers/llm.js";
import { addItem, moveItemToDay, removeItem, updateItem } from "./planner.service.js";

export type CandidatePoi = {
  name: string;
  amapId?: string;
  lng?: number;
  lat?: number;
  city?: string;
  category?: string;
  address?: string;
  resolved: boolean;
};

const namesSchema = z.object({
  places: z.array(z.string().min(1)).max(30),
});

function cleanChunk(raw: string): string {
  return raw
    .replace(/^\s*(?:第?\s*\d+\s*[天日站]|Day\s*\d+|D\d+)\s*[:：.\-、]?\s*/i, "")
    .replace(/^\d{1,2}:\d{2}\s*/, "")
    .replace(/^(?:上午|下午|中午|晚上)\s*(?:去|到|在|吃)?/, "")
    .replace(/^[\d.、．\-\s●•◆★☆►▶]+/, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/(?:吃饭|午餐|晚餐|打卡)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PLACE_HINT =
  /(?:博物馆|纪念馆|艺术馆|科技馆|展览馆|动物园|植物园|游乐园|古镇|古城|寺|庙|宫|苑|园|山|湖|海|岛|湾|滩|峡|谷|峰|林|街|巷|路|里|坊|广场|公园|景区|风景区|遗址|故居|书院|塔|桥|码头|机场|车站|高铁站|地铁站|酒店|宾馆|客栈|民宿|饭店|餐厅|火锅|咖啡|宽窄|锦里|春熙|太古|三星堆|大熊猫|都江堰|青城)/;

const FOOD_HINT =
  /(?:餐厅|饭店|酒楼|火锅|烧烤|烤肉|咖啡|咖啡馆|奶茶|小吃|面馆|面店|粉店|茶馆|酒吧|酒馆|食堂|料理|寿司|串串|冒菜|小馆|小店|美食|食堂|大排档|苍蝇馆|私房菜|本帮|川菜|粤菜|湘菜)/;

const SCENIC_ONLY =
  /(?:博物馆|纪念馆|艺术馆|科技馆|展览馆|动物园|植物园|游乐园|古镇|古城|寺|庙|宫|苑|园|山|湖|公园|广场|景区|风景区|遗址|故居|书院|塔|机场|车站|高铁站|酒店|宾馆|客栈|民宿)(?:$|[^店馆])/;

export type ExtractMode = "all" | "restaurants";

/** 无 LLM 时：分隔符切分 + 书名号 + 地名后缀启发式 */
export function heuristicNames(text: string): string[] {
  const uniq: string[] = [];
  const push = (s: string) => {
    const t = cleanChunk(s);
    if (t.length < 2 || t.length > 40) return;
    if (/^https?:\/\//i.test(t)) return;
    if (t.length > 10 && /(?:上午|下午|中午|晚上|然后|接着|出发|到达)/.test(t)) return;
    if (!uniq.includes(t)) uniq.push(t);
  };

  for (const m of text.matchAll(/《([^》]{2,40})》/g)) push(m[1]!);
  for (const m of text.matchAll(/「([^」]{2,40})」/g)) push(m[1]!);

  for (const m of text.matchAll(
    /[\u4e00-\u9fffA-Za-z0-9]{1,16}(?:博物馆|纪念馆|艺术馆|科技馆|展览馆|动物园|植物园|游乐园|古镇|古城|寺|庙|宫|苑|园|山|湖|公园|广场|景区|风景区|遗址|故居|书院|塔|街|巷|巷子|机场|车站|高铁站|酒店|宾馆|客栈|民宿|饭店|餐厅)/g,
  )) {
    push(m[0]!);
  }

  const chunks = text.split(/[\n\r,，、;；|｜/／]+/);
  for (const chunk of chunks) {
    const parts = chunk.split(/\s*(?:→|->|—+|～+|~+)\s*/);
    for (const p of parts) {
      const t = cleanChunk(p);
      if (!t) continue;
      if (t.length <= 14 && /[\u4e00-\u9fff]{2,}/.test(t) && !/(?:然后|接着|出发)/.test(t)) {
        push(t);
      }
    }
  }

  const ranked = [...uniq].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const n of ranked) {
    if (out.some((x) => x !== n && x.includes(n))) continue;
    if (!PLACE_HINT.test(n) && n.length > 12) continue;
    out.push(n);
    if (out.length >= 20) break;
  }
  return out.length ? out : uniq.slice(0, 20);
}

/** 点评/攻略文案：偏餐馆店名 */
export function heuristicRestaurantNames(text: string): string[] {
  const uniq: string[] = [];
  const push = (s: string) => {
    let t = cleanChunk(s);
    t = t
      .replace(/^(?:推荐|必吃|打卡|探店)\s*/u, "")
      .replace(/(?:不错|好吃|安利|强烈推荐|真的爱|绝了|可以|很棒)$/u, "")
      .trim();
    if (t.length < 2 || t.length > 40) return;
    if (/^https?:\/\//i.test(t)) return;
    if (/^\d+(\.\d+)?分/.test(t)) return;
    if (/人均|多少钱|元\/人|打卡攻略/.test(t)) return;
    if (SCENIC_ONLY.test(t) && !FOOD_HINT.test(t)) return;
    if (!uniq.includes(t)) uniq.push(t);
  };

  for (const m of text.matchAll(/《([^》]{2,40})》/g)) push(m[1]!);
  for (const m of text.matchAll(/「([^」]{2,40})」/g)) push(m[1]!);
  for (const m of text.matchAll(/【([^】]{2,40})】/g)) push(m[1]!);

  for (const m of text.matchAll(
    /[\u4e00-\u9fffA-Za-z0-9·・]{1,20}(?:餐厅|饭店|酒楼|火锅|烧烤|咖啡馆|咖啡|小吃|面馆|面店|粉店|茶馆|酒吧|料理|寿司|串串|冒菜|小馆|私房菜)/g,
  )) {
    push(m[0]!);
  }

  const chunks = text.split(/[\n\r,，、;；|｜/／]+/);
  for (const chunk of chunks) {
    const t = cleanChunk(chunk);
    if (!t) continue;
    if (FOOD_HINT.test(t) || (t.length >= 2 && t.length <= 16 && /店$/.test(t))) {
      push(t);
    }
  }

  const ranked = [...uniq].sort((a, b) => {
    const af = FOOD_HINT.test(a) ? 1 : 0;
    const bf = FOOD_HINT.test(b) ? 1 : 0;
    if (af !== bf) return bf - af;
    return b.length - a.length;
  });
  const out: string[] = [];
  for (const n of ranked) {
    if (out.some((x) => x !== n && x.includes(n))) continue;
    out.push(n);
    if (out.length >= 20) break;
  }
  return out;
}

async function resolveName(name: string, city?: string): Promise<CandidatePoi> {
  try {
    const hits = await amap.searchPoi(name, city);
    const hit = hits[0];
    if (!hit) return { name, resolved: false };
    return {
      name: hit.name,
      amapId: hit.amapId,
      lng: hit.lng,
      lat: hit.lat,
      city: hit.city,
      category: hit.category,
      address: hit.address,
      resolved: true,
    };
  } catch {
    return { name, resolved: false };
  }
}

export async function extractPois(
  text: string,
  city?: string,
  mode: ExtractMode = "all",
  images: llm.LlmImage[] = [],
): Promise<{ places: CandidatePoi[]; source: "llm" | "rules" }> {
  const trimmed = text.trim();
  if (!trimmed && images.length === 0) {
    throw Object.assign(new Error("请粘贴内容或添加图片"), { code: 40001 });
  }
  if (images.length > 3) {
    throw Object.assign(new Error("最多 3 张图片"), { code: 40001 });
  }

  const restaurants = mode === "restaurants";
  const system = restaurants
    ? images.length
      ? '从用户提供的大众点评/美食截图与文案中只提取餐馆、咖啡馆、小吃店等店名，排除纯景点与酒店。只输出 JSON：{"places":["名称",...]}，最多 20 个，不要解释。'
      : '从用户粘贴的大众点评/美食攻略文案中只提取餐馆、咖啡馆、小吃店等店名，排除纯景点与酒店。只输出 JSON：{"places":["名称",...]}，最多 20 个，不要解释。'
    : images.length
      ? '从用户提供的旅行笔记截图与文案中提取景点与餐饮店名（可含酒店），忽略广告与无关文字。只输出 JSON：{"places":["名称",...]}，最多 20 个，不要解释。'
      : '从用户粘贴的旅行笔记中提取景点/餐厅/酒店等地名。保留用户原文里的地名，不要换成另一个景区（「黄山九寨」不要写成「黄山」）。只输出 JSON：{"places":["名称",...]}，最多 20 个，不要解释。';
  const fallback = restaurants ? heuristicRestaurantNames : heuristicNames;
  const userText =
    trimmed.slice(0, 8000) ||
    (restaurants ? "请识别图中的餐馆店名。" : "请识别图中的景点与餐饮店名。");

  let names: string[] = [];
  let source: "llm" | "rules" = "rules";
  try {
    const raw =
      images.length > 0
        ? await llm.chatJsonWithImagesRetry(system, userText, images)
        : await llm.chatJsonRetry(system, userText);
    const parsed = namesSchema.safeParse(raw);
    if (parsed.success) {
      names = parsed.data.places.map((s) => s.trim()).filter(Boolean);
      source = "llm";
    }
  } catch (e) {
    if (images.length > 0) throw e; // 看图必须 LLM，不静默降级成空规则
    names = fallback(trimmed);
  }
  if (names.length === 0 && trimmed) {
    names = fallback(trimmed);
    source = "rules";
  }
  if (names.length === 0) return { places: [], source };

  const places: CandidatePoi[] = [];
  for (const n of names.slice(0, 20)) {
    places.push(await resolveName(n, city));
  }
  return { places, source };
}

export type PlanPoiIn = {
  name: string;
  amapId?: string | null;
  lng?: number | null;
  lat?: number | null;
  city?: string | null;
  category?: string | null;
};

export type DraftItem = {
  name: string;
  amapId?: string | null;
  lng?: number | null;
  lat?: number | null;
  city?: string | null;
  category?: string | null;
  startTime?: string | null;
  durationMin: number;
};

export type DraftDay = {
  dayId: string;
  date: string;
  items: DraftItem[];
};

/** 按纬度粗分天；同天内最近邻排序。不算距离给 LLM。 */
function clusterAndOrder(pois: PlanPoiIn[], dayCount: number): PlanPoiIn[][] {
  if (dayCount <= 0) return [];
  if (pois.length === 0) return Array.from({ length: dayCount }, () => []);

  const withGeo = pois.filter((p) => p.lng != null && p.lat != null);
  const noGeo = pois.filter((p) => p.lng == null || p.lat == null);

  const buckets: PlanPoiIn[][] = Array.from({ length: dayCount }, () => []);
  if (withGeo.length === 0) {
    pois.forEach((p, i) => buckets[i % dayCount]!.push(p));
    return buckets;
  }

  const sorted = [...withGeo].sort((a, b) => (a.lat! - b.lat!) || (a.lng! - b.lng!));
  const size = Math.ceil(sorted.length / dayCount);
  for (let i = 0; i < dayCount; i++) {
    buckets[i] = sorted.slice(i * size, (i + 1) * size);
  }
  noGeo.forEach((p, i) => buckets[i % dayCount]!.push(p));

  return buckets.map(orderNearest);
}

function orderNearest(pois: PlanPoiIn[]): PlanPoiIn[] {
  if (pois.length <= 1) return pois;
  const geo = pois.filter((p) => p.lng != null && p.lat != null);
  const rest = pois.filter((p) => p.lng == null || p.lat == null);
  if (geo.length <= 1) return [...geo, ...rest];

  const remaining = [...geo];
  remaining.sort((a, b) => a.lng! - b.lng!);
  const path: PlanPoiIn[] = [remaining.shift()!];
  while (remaining.length) {
    const last = path[path.length - 1]!;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]!;
      const d = (p.lng! - last.lng!) ** 2 + (p.lat! - last.lat!) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    path.push(remaining.splice(best, 1)[0]!);
  }
  return [...path, ...rest];
}

type DayRef =
  | { kind: "dom"; day: number }
  | { kind: "md"; month: number; day: number }
  | { kind: "index"; index: number };

type TextGroup = { ref: DayRef; body: string; tail: string };

const PLACE_SUFFIX =
  /(?:博物馆|纪念馆|艺术馆|科技馆|展览馆|风景区|景区|公园|高铁站|车站|酒店|宾馆|站)$/u;

/** 「4号：A、B；5号：C」按日历日切开；「然后…」归到该日的下一天 */
export function parseDayGroups(text: string): TextGroup[] {
  const re = /第\s*(\d+)\s*天|(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]|(\d{1,2})\s*号/g;
  const hits: { start: number; end: number; ref: DayRef }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const ref: DayRef = m[1]
      ? { kind: "index", index: Number(m[1]) - 1 }
      : m[2] && m[3]
        ? { kind: "md", month: Number(m[2]), day: Number(m[3]) }
        : { kind: "dom", day: Number(m[4]) };
    if (ref.kind === "dom" && (ref.day < 1 || ref.day > 31)) continue;
    if (ref.kind === "index" && (ref.index < 0 || ref.index > 60)) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, ref });
  }
  if (!hits.length) return [];

  return hits.map((h, i) => {
    const raw = text.slice(h.end, i + 1 < hits.length ? hits[i + 1]!.start : text.length);
    const parts = raw.split(/\s*(?:然后|接着|之后|随后)\s*/);
    const clean = (s: string) => s.replace(/^[\s:：.、,，;；]+/, "").replace(/[;；。]+$/, "").trim();
    return { ref: h.ref, body: clean(parts[0] ?? ""), tail: clean(parts.slice(1).join(" ")) };
  });
}

function ymd(iso: string): { month: number; day: number } {
  return { month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

function resolveDay(ref: DayRef, dates: { month: number; day: number }[]): number | null {
  if (ref.kind === "index") return ref.index < dates.length ? ref.index : null;
  if (ref.kind === "md") {
    const i = dates.findIndex((d) => d.month === ref.month && d.day === ref.day);
    return i >= 0 ? i : null;
  }
  const hits = dates.flatMap((d, i) => (d.day === ref.day ? [i] : []));
  return hits.length ? hits[0]! : null;
}

function stripParen(s: string): string {
  return s.replace(/（[^）]*）|\([^)]*\)/g, "");
}

/** ponytail: 短名（<3 字且后面还是汉字）不算命中，避免「成都」粘上「成都东」。升级：接分词。 */
function indexOfName(body: string, key: string): number {
  let from = 0;
  while (from < body.length) {
    const i = body.indexOf(key, from);
    if (i < 0) return -1;
    const next = body[i + key.length] ?? "";
    if (key.length < 3 && /[\u4e00-\u9fff]/.test(next)) {
      from = i + 1;
      continue;
    }
    return i;
  }
  return -1;
}

function mentionIndex(body: string, poiName: string): number {
  const name = poiName.replace(/\s+/g, "");
  const stripped = name.replace(PLACE_SUFFIX, "");
  const keys = [name];
  if (stripped.length >= 2 && stripped !== name) keys.push(stripped);
  for (let len = stripped.length - 1; len >= 2; len--) keys.push(stripped.slice(-len));
  const uniq = [...new Set(keys)].sort((a, b) => b.length - a.length);
  for (const key of uniq) {
    const i = indexOfName(body, key);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * 原文写了「N号 / 第N天」时按那个日期放，不再按纬度切天。
 * 没有日期标记则返回 null，交给 clusterAndOrder。
 */
export function assignPoisToDays(
  pois: PlanPoiIn[],
  dayDates: string[],
  sourceText: string,
): PlanPoiIn[][] | null {
  const groups = parseDayGroups(sourceText);
  if (!groups.length || dayDates.length === 0) return null;

  const dates = dayDates.map(ymd);
  const buckets: PlanPoiIn[][] = dayDates.map(() => []);
  const used = new Set<number>();
  let matched = false;
  let tailAt = 0;

  const take = (dayIdx: number, body: string) => {
    if (!body.trim() || dayIdx < 0 || dayIdx >= buckets.length) return;
    const plain = stripParen(body);
    const ranked = pois
      .map((p, i) => ({ p, i, at: mentionIndex(plain, p.name) }))
      .filter((x) => x.at >= 0 && !used.has(x.i))
      .sort((a, b) => a.at - b.at || b.p.name.length - a.p.name.length);
    for (const x of ranked) {
      used.add(x.i);
      buckets[dayIdx]!.push(x.p);
    }
  };

  for (const g of groups) {
    const idx = resolveDay(g.ref, dates);
    if (idx == null) continue;
    matched = true;
    take(idx, g.body);
    const next = idx + 1 < dayDates.length ? idx + 1 : idx;
    tailAt = next;
    if (g.tail) take(next, g.tail);
  }
  if (!matched) return null;

  for (let i = 0; i < pois.length; i++) {
    if (!used.has(i)) buckets[tailAt]!.push(pois[i]!);
  }
  return buckets;
}

export async function buildPlan(
  tripId: string,
  pois: PlanPoiIn[],
  sourceText = "",
): Promise<DraftDay[]> {
  if (pois.length === 0) throw Object.assign(new Error("请先确认至少一个地点"), { code: 40001 });

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { date: "asc" } } },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  if (trip.days.length === 0) throw Object.assign(new Error("行程没有日期"), { code: 40001 });

  const dates = trip.days.map((d) => d.date.toISOString().slice(0, 10));
  const hinted = sourceText.trim() ? assignPoisToDays(pois, dates, sourceText) : null;
  const groups = hinted ?? clusterAndOrder(pois, trip.days.length);
  return trip.days.map((day, i) => ({
    dayId: day.id,
    date: day.date.toISOString(),
    items: (groups[i] ?? []).map((p) => ({
      name: p.name,
      amapId: p.amapId,
      lng: p.lng,
      lat: p.lat,
      city: p.city,
      category: p.category,
      startTime: null,
      durationMin: 90,
    })),
  }));
}

export async function commitPlan(tripId: string, days: DraftDay[]) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: true },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const dayIds = new Set(trip.days.map((d) => d.id));
  for (const d of days) {
    if (!dayIds.has(d.dayId)) {
      throw Object.assign(new Error("草稿日期与行程不匹配"), { code: 40001 });
    }
    for (const it of d.items) {
      const hasCoord = it.lng != null && it.lat != null;
      await addItem(d.dayId, {
        startTime: it.startTime ?? undefined,
        durationMin: it.durationMin,
        ...(hasCoord
          ? {
              poi: {
                name: it.name,
                lng: it.lng!,
                lat: it.lat!,
                amapId: it.amapId ?? undefined,
                city: it.city ?? undefined,
                category: it.category ?? undefined,
              },
            }
          : { customName: it.name }),
      });
    }
  }

  return prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { date: "asc" },
        include: {
          items: {
            orderBy: { seq: "asc" },
            include: { poi: true, legToNext: true },
          },
        },
      },
    },
  });
}

const tripFullInclude = {
  days: {
    orderBy: { date: "asc" as const },
    include: {
      items: {
        orderBy: { seq: "asc" as const },
        include: { poi: true, legToNext: true },
      },
    },
  },
};

export type AdjustOp =
  | { op: "move"; itemId: string; toDayIndex: number; toSeq?: number }
  | { op: "remove"; itemId: string }
  | { op: "setTime"; itemId: string; startTime: string }
  | { op: "rename"; itemId: string; name: string };

const adjustOpsSchema = z.object({
  summary: z.string().max(200).optional(),
  ops: z
    .array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("move"),
          itemId: z.string().min(1),
          toDayIndex: z.number().int().nonnegative(),
          toSeq: z.number().int().nonnegative().optional(),
        }),
        z.object({
          op: z.literal("remove"),
          itemId: z.string().min(1),
        }),
        z.object({
          op: z.literal("setTime"),
          itemId: z.string().min(1),
          startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        }),
        z.object({
          op: z.literal("rename"),
          itemId: z.string().min(1),
          name: z.string().min(1).max(80),
        }),
      ]),
    )
    .max(20),
});

type TripSnap = {
  days: Array<{
    id: string;
    date: Date;
    items: Array<{
      id: string;
      customName: string | null;
      startTime: string | null;
      poi: { name: string } | null;
    }>;
  }>;
};

function itemTitle(it: { customName: string | null; poi: { name: string } | null }) {
  return it.poi?.name || it.customName || "未命名";
}

/** 子串或按字顺序匹配（「熊猫基地」≈「成都大熊猫繁育研究基地」） */
function nameMatches(title: string, hint: string): boolean {
  if (!hint) return false;
  if (title.includes(hint) || hint.includes(title)) return true;
  let i = 0;
  for (const ch of title) {
    if (ch === hint[i]) i++;
    if (i >= hint.length) return true;
  }
  return false;
}

function findItemByName(trip: TripSnap, hint: string) {
  const q = hint.trim().replace(/[《》「」]/g, "");
  if (!q) return null;
  const all = trip.days.flatMap((d, di) =>
    d.items.map((it) => ({ it, di, title: itemTitle(it) })),
  );
  const exact = all.find((x) => x.title === q);
  if (exact) return exact;
  const hits = all.filter((x) => nameMatches(x.title, q));
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) {
    hits.sort((a, b) => a.title.length - b.title.length);
    return hits[0]!;
  }
  return null;
}

/** 无 LLM 时：常见中文指令启发式 */
export function heuristicAdjustOps(instruction: string, trip: TripSnap): AdjustOp[] {
  const text = instruction.trim();
  const ops: AdjustOp[] = [];

  const move =
    /(?:把|将)?\s*[《「]?(.+?)[》」]?\s*(?:改到|调到|移到|放到|挪到)\s*第?\s*(\d+)\s*天/.exec(text) ||
    /(?:把|将)?\s*[《「]?(.+?)[》」]?\s*(?:改到|调到|移到|放到|挪到)\s*D\s*(\d+)/i.exec(text);
  if (move) {
    const hit = findItemByName(trip, move[1]!);
    const dayIdx = Number(move[2]) - 1;
    if (hit && dayIdx >= 0 && dayIdx < trip.days.length) {
      ops.push({ op: "move", itemId: hit.it.id, toDayIndex: dayIdx });
    }
  }

  const del =
    /(?:删除|去掉|移除)\s*[《「]?(.+?)[》」]?\s*$/.exec(text) ||
    /(?:把|将)\s*[《「]?(.+?)[》」]?\s*(?:删掉|删除|去掉)/.exec(text);
  if (del) {
    const hit = findItemByName(trip, del[1]!);
    if (hit) ops.push({ op: "remove", itemId: hit.it.id });
  }

  const time =
    /(?:把|将)?\s*[《「]?(.+?)[》」]?\s*(?:改|调)?到?\s*(\d{1,2})\s*[:：点]\s*(\d{2})/.exec(text) ||
    /(?:把|将)?\s*[《「]?(.+?)[》」]?\s*(?:时间改?为|设为)\s*(\d{1,2})\s*[:：点]\s*(\d{2})/.exec(text);
  if (time) {
    const hit = findItemByName(trip, time[1]!);
    if (hit) {
      const hh = String(Math.min(23, Number(time[2]))).padStart(2, "0");
      const mm = String(Math.min(59, Number(time[3]))).padStart(2, "0");
      ops.push({ op: "setTime", itemId: hit.it.id, startTime: `${hh}:${mm}` });
    }
  }

  return ops;
}

function describeOps(ops: AdjustOp[], trip: TripSnap): string {
  const titleOf = (id: string) => {
    for (const d of trip.days) {
      const it = d.items.find((x) => x.id === id);
      if (it) return itemTitle(it);
    }
    return "地点";
  };
  if (!ops.length) return "未识别到可执行的调整";
  return ops
    .map((op) => {
      if (op.op === "move") return `将「${titleOf(op.itemId)}」移到第 ${op.toDayIndex + 1} 天`;
      if (op.op === "remove") return `删除「${titleOf(op.itemId)}」`;
      if (op.op === "setTime") return `将「${titleOf(op.itemId)}」时刻改为 ${op.startTime}`;
      return `将「${titleOf(op.itemId)}」改名为「${op.name}」`;
    })
    .join("；");
}

export async function proposeAdjust(tripId: string, instruction: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: tripFullInclude,
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const snap: TripSnap = trip;
  const catalog = trip.days.map((d, di) => ({
    dayIndex: di,
    dayId: d.id,
    date: d.date.toISOString().slice(0, 10),
    items: d.items.map((it, seq) => ({
      itemId: it.id,
      seq,
      name: itemTitle(it),
      startTime: it.startTime,
    })),
  }));

  let ops: AdjustOp[] = [];
  let source: "llm" | "rules" = "rules";

  try {
    const raw = await llm.chatJson(
      `你是行程编辑助手。根据用户指令，对已有行程输出 JSON 操作，不要编造不存在的 itemId。
只输出：{"summary":"一句话","ops":[...]}
ops 仅允许：
- {"op":"move","itemId":"...","toDayIndex":0,"toSeq":0}  // toDayIndex 从 0 起；toSeq 可选
- {"op":"remove","itemId":"..."}
- {"op":"setTime","itemId":"...","startTime":"HH:mm"}
- {"op":"rename","itemId":"...","name":"..."}
itemId 必须来自输入列表。无法理解则 ops 为空数组。`,
      `行程：\n${JSON.stringify(catalog)}\n\n用户指令：${instruction}`,
    );
    const parsed = adjustOpsSchema.safeParse(raw);
    if (parsed.success) {
      ops = parsed.data.ops;
      source = "llm";
    }
  } catch {
    // fall through to rules
  }

  if (ops.length === 0) {
    ops = heuristicAdjustOps(instruction, snap);
    source = "rules";
  }

  // validate ids / day index
  const itemIds = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)));
  const dayCount = trip.days.length;
  ops = ops.filter((op) => {
    if (!itemIds.has(op.itemId)) return false;
    if (op.op === "move" && (op.toDayIndex < 0 || op.toDayIndex >= dayCount)) return false;
    return true;
  });

  const summary =
    ops.length === 0
      ? "没听懂或找不到对应地点，可试：「把熊猫基地改到第2天」"
      : describeOps(ops, snap);

  return { summary, ops, source };
}

export async function applyAdjust(tripId: string, ops: AdjustOp[]) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { date: "asc" } } },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  if (!ops.length) throw Object.assign(new Error("没有可应用的操作"), { code: 40001 });

  const dayIds = trip.days.map((d) => d.id);
  const itemIds = new Set(
    (
      await prisma.itineraryItem.findMany({
        where: { dayId: { in: dayIds } },
        select: { id: true },
      })
    ).map((x) => x.id),
  );

  for (const op of ops) {
    if (!itemIds.has(op.itemId)) {
      throw Object.assign(new Error("操作引用了不存在的地点"), { code: 40001 });
    }
    if (op.op === "move") {
      const toDayId = dayIds[op.toDayIndex];
      if (!toDayId) throw Object.assign(new Error("目标天无效"), { code: 40001 });
      await moveItemToDay(op.itemId, toDayId, op.toSeq);
    } else if (op.op === "remove") {
      await removeItem(op.itemId);
      itemIds.delete(op.itemId);
    } else if (op.op === "setTime") {
      await updateItem(op.itemId, { startTime: op.startTime });
    } else if (op.op === "rename") {
      await updateItem(op.itemId, { customName: op.name });
    }
  }

  return prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: tripFullInclude,
  });
}
