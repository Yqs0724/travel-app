import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import * as amap from "../providers/amap.js";
import * as llm from "../providers/llm.js";
import { addItem } from "./planner.service.js";

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
      : '从用户粘贴的旅行笔记中提取景点/餐厅/酒店等地名。只输出 JSON：{"places":["名称",...]}，最多 20 个，不要解释。';
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

function defaultStart(seq: number): string {
  const h = 9 + Math.floor(seq * 2);
  return `${String(Math.min(h, 20)).padStart(2, "0")}:00`;
}

export async function buildPlan(tripId: string, pois: PlanPoiIn[]): Promise<DraftDay[]> {
  if (pois.length === 0) throw Object.assign(new Error("请先确认至少一个地点"), { code: 40001 });

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { date: "asc" } } },
  });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  if (trip.days.length === 0) throw Object.assign(new Error("行程没有日期"), { code: 40001 });

  const groups = clusterAndOrder(pois, trip.days.length);
  return trip.days.map((day, i) => ({
    dayId: day.id,
    date: day.date.toISOString(),
    items: (groups[i] ?? []).map((p, seq) => ({
      name: p.name,
      amapId: p.amapId,
      lng: p.lng,
      lat: p.lat,
      city: p.city,
      category: p.category,
      startTime: defaultStart(seq),
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
