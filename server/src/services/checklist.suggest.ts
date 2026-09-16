/** 清单智能推荐：纯规则，不调 LLM */

export type SuggestInput = {
  poiBlob: string; // 站名+类别拼接
  modes: string[]; // leg modes
  weatherBlob: string; // 天气文案拼接
  temps: number[];
  existingNames: string[];
};

export type SuggestItem = {
  category: string;
  name: string;
  reason: string;
};

type Rule = {
  reason: string;
  test: (ctx: { poi: string; modes: string; weather: string; maxTemp: number; minTemp: number }) => boolean;
  items: Array<{ category: string; name: string }>;
};

const RULES: Rule[] = [
  {
    reason: "预报有降水",
    test: (c) => /雨|雪|雹/.test(c.weather),
    items: [
      { category: "衣物", name: "雨伞 / 雨衣" },
      { category: "鞋履", name: "防水鞋或备用鞋" },
    ],
  },
  {
    reason: "预报高温",
    test: (c) => c.maxTemp >= 33 || /炎热|高温/.test(c.weather),
    items: [
      { category: "其他", name: "防晒霜" },
      { category: "其他", name: "遮阳帽 / 墨镜" },
      { category: "其他", name: "保温杯 / 水壶" },
    ],
  },
  {
    reason: "预报偏冷",
    test: (c) => c.minTemp <= 8 || /寒|冰|霜/.test(c.weather),
    items: [
      { category: "衣物", name: "保暖外套" },
      { category: "衣物", name: "围巾 / 手套" },
    ],
  },
  {
    reason: "行程含登山/徒步",
    test: (c) => /登山|徒步|爬山|峰|山/.test(c.poi),
    items: [
      { category: "鞋履", name: "登山鞋 / 防滑运动鞋" },
      { category: "其他", name: "轻便背包" },
    ],
  },
  {
    reason: "行程含海边/沙滩",
    test: (c) => /海|沙滩|泳|礁/.test(c.poi),
    items: [
      { category: "衣物", name: "泳衣" },
      { category: "其他", name: "拖鞋" },
      { category: "其他", name: "防晒霜" },
    ],
  },
  {
    reason: "行程含乘机/机场",
    test: (c) => /机场|航班|飞机/.test(c.poi) || /\bflight\b|flight/.test(c.modes),
    items: [
      { category: "违禁品自查", name: "液体 ≤100ml 且装透明袋" },
      { category: "违禁品自查", name: "充电宝随身、不托运" },
      { category: "证件", name: "登机牌 / 行程单" },
    ],
  },
  {
    reason: "行程含高原相关",
    test: (c) => /高原|拉萨|林芝|香格里拉|日喀则/.test(c.poi),
    items: [
      { category: "药品", name: "抗高反药（遵医嘱）" },
      { category: "衣物", name: "冲锋衣 / 保暖层" },
    ],
  },
];

export function buildSuggestions(input: SuggestInput): SuggestItem[] {
  const have = new Set(input.existingNames.map((n) => n.trim()).filter(Boolean));
  const temps = input.temps.filter((t) => Number.isFinite(t));
  const ctx = {
    poi: input.poiBlob,
    modes: input.modes.join(" "),
    weather: input.weatherBlob,
    maxTemp: temps.length ? Math.max(...temps) : -999,
    minTemp: temps.length ? Math.min(...temps) : 999,
  };

  const out: SuggestItem[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (!rule.test(ctx)) continue;
    for (const it of rule.items) {
      if (have.has(it.name) || seen.has(it.name)) continue;
      seen.add(it.name);
      out.push({ ...it, reason: rule.reason });
    }
  }
  return out;
}
