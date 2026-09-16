export type TemplateId = "general" | "flight-ban" | "plateau" | "beach" | "family";

export const TEMPLATE_META: Array<{ id: TemplateId; label: string }> = [
  { id: "general", label: "通用必备" },
  { id: "flight-ban", label: "乘机违禁" },
  { id: "plateau", label: "高原" },
  { id: "beach", label: "海边" },
  { id: "family", label: "亲子" },
];

type Row = { category: string; name: string };

const TEMPLATES: Record<TemplateId, Row[]> = {
  general: [
    { category: "证件", name: "身份证" },
    { category: "证件", name: "银行卡 / 现金" },
    { category: "衣物", name: "换洗衣物" },
    { category: "衣物", name: "内衣袜" },
    { category: "电子", name: "手机充电器" },
    { category: "电子", name: "充电宝" },
    { category: "药品", name: "常用药 / 创可贴" },
    { category: "洗漱", name: "牙刷牙膏" },
  ],
  "flight-ban": [
    { category: "违禁品自查", name: "液体 ≤100ml 且装透明袋" },
    { category: "违禁品自查", name: "无打火机 / 火柴" },
    { category: "违禁品自查", name: "无充电宝超 100Wh" },
    { category: "违禁品自查", name: "无刀具 / 锐器托运确认" },
    { category: "违禁品自查", name: "无压力罐（防晒喷雾等）随身" },
    { category: "违禁品自查", name: "充电宝随身、不托运" },
  ],
  plateau: [
    { category: "药品", name: "抗高反药（遵医嘱）" },
    { category: "衣物", name: "冲锋衣 / 保暖层" },
    { category: "电子", name: "墨镜" },
    { category: "其他", name: "润唇膏 / 防晒霜" },
  ],
  beach: [
    { category: "衣物", name: "泳衣" },
    { category: "其他", name: "防晒霜" },
    { category: "其他", name: "拖鞋" },
    { category: "电子", name: "防水袋" },
  ],
  family: [
    { category: "证件", name: "小孩证件 / 户口页" },
    { category: "衣物", name: "儿童换洗衣物" },
    { category: "药品", name: "儿童常用药" },
    { category: "其他", name: "零食 / 湿巾" },
  ],
};

export function templateRows(id: TemplateId): Row[] {
  return TEMPLATES[id];
}
