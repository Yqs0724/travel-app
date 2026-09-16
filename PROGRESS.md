# 行迹 TripTrace · 项目进度交接

> 日期：**2026-09-16** ｜ 形态：个人自用 Web（移动端优先）  
> 文档：`PRD.md` / `Tech-Design.md` / `UI-design.md` / `Agents.md`  
> GitHub：https://github.com/Yqs0724/travel-app （`main`，本地 `.env` **不**入库）

---

## 0. 新窗口接续（先读这里）

### 怎么开干
1. 读本文件 §0–§2 + `Agents.md` 硬规则；改 UI 再看 `UI-design.md`。
2. 仓库根：`npm install` → `npm run db:generate` → `npm run db:push` → `npm run dev`  
   - web `127.0.0.1:5173`，server `:3000`，`/api` 已代理。  
   - Key/密码在本地 `server/.env`、`web/.env`（参考 `*.env.example`）。开发常用密码 `triptrace`。
3. **Windows**：PowerShell 不要用 `&&` 串命令；`prisma generate` 若 EPERM，先停掉占用 `server` 的 node 再生成。

### 当前状态（一句话）
**可用个人版已落地并推 GitHub**：行程地图主视觉、AI 排程、清单、**我的代付账本**、只读/弱协作分享、**AA 小票分享**（链接/HTML/PDF）。未做的只有可选增强（见 §4）。

### 最近定稿决策（勿回退）
| 主题 | 定稿 |
|---|---|
| 记账心智 | **我的代付账本**：只记「我已支出」；`payer` 固定为成员「我」；个人=不勾共同，共同=勾选朋友均分；结算文案 **朋友应付我** |
| 估价 vs 账单 | 门票/路费只在行程列表显示 **参考价**，**绝不**自动进 Expense；`syncDayBudget` 已删；启动时 `purgeEstimateLinkedExpenses()` 清历史脏数据 |
| 同行人 | 成员列表 UI **只编辑朋友**（≥1）；「我」由后端保证，解析时过滤名叫「我」的输入 |
| 分享两种 | `ShareLink.kind`：默认行程只读；`kind=aa` = 共同支出小票（不含个人账单） |
| AA 小票 UX | 面向朋友：无朋友姓名印在票上；分享时选收件人 → `?for=` 过滤应付额；热敏收据风；**禁止**橙强调色 |
| AA 小票视觉 | 单框线、底撕边；顶猫爪 / 底狗爪；半价金额用 `#D1DECD` 的 `\` 划掉 + 右上 `50%`；色板 `#F7F7F7` / `#D1DECD` / `#BEC0BC` / `#749469` / `#548046`（**仅** `AaTicket`/`aaExport` 例外于全局暖米色 token） |
| 地图 | 针/路线对齐；leg 多色；点 leg 芯片可改交通方式 |

### 新窗口建议首句（可粘贴）
> 继续开发行迹 TripTrace（`d:\cursor-projects\旅游app`）。先读 `PROGRESS.md` §0 与 `Agents.md`。不要恢复估价→账单自动同步；记账保持「我的代付账本」；AA 小票视觉与 kind=aa 分享约定勿改。本地 `.env` 已有，勿提交。

---

## 1. 整体架构

```
浏览器（Vite React SPA）
  ├── 高德 JS API（地图渲染，仅 features/planner/MapView）
  └── /api → Fastify :3000
        ├── routes → services（联动重算在此）
        ├── providers（amap / llm，外部 Key 不进前端）
        └── Prisma → SQLite
```

| 层 | 选型 | 关键决策 |
|---|---|---|
| 前端 | React 18 + TS + Vite + Tailwind + Zustand | 全栈 TS；不做暗色 |
| UI | 暖米色 token（主应用）；AA 小票独立青绿热敏色板 | 纸感工具，非社区 |
| 后端 | Fastify + Prisma + SQLite WAL | 个人零运维 |
| 地图 | 高德 JS Key（前端）+ Web Key（后端代理） | 服务端 Key 不泄露 |
| AI | OpenAI 兼容 LLM（可选） | 无 Key 时按行拆分地名仍可用 |
| 鉴权 | 访问密码 → JWT 7 天 | 分享接口除外（token 即权限） |

**数据原则**：行程（Trip → Day → Item + Leg）是唯一数据源；增删改排后服务端整包返回当天，前端不做本地推算。

---

## 2. 已完成核心功能

### 2.1–2.4 基建 / 壳 / 行程地图 / AI
- [x] Prisma 全量 schema；JWT；`{ code, data, message }`；Vite `127.0.0.1`
- [x] 顶栏行程切换 + `···`；底栏 **行程 / AI / 清单 / 记账**（无独立地图 Tab）
- [x] 行程 Tab：切日点阵 + MapView（编号针、多色 leg、点芯片改 mode）+ 可拖目录抽屉 + 半屏编辑
- [x] AI：提取 → 勾选 → 草稿 → 确认写入；地理分天在后端，禁止 LLM 算距离

### 2.5 清单 / 记账（代付账本）
- [x] 清单：扁平列表 + 常用套装；天气/行程智能推荐已接
- [x] 记账：`ExpensePanel` = 我的支出列表 + 共同开关 + 朋友应付我；可编辑、可附图
- [x] 同行人：`MembersEditor` 只管朋友；结算 `settlement.ts` 净额法

### 2.6 外部代理
- [x] `/api/v1/proxy/amap/poi`、`/route`（无 Key → 502，手动路径仍可用）
- [x] 天气 / 预约提醒 / **当天实时路况** 图层

### 2.7 分享
- [x] 行程只读分享：`POST .../share` → `/share/:token`（无账单/清单/成员）
- [x] 弱协作：`share/edit` + 密码 → editor JWT + `expectedVersion`
- [x] **AA 小票分享**：`kind=aa`；前端 `AaShareView` / `AaTicket` / `aaExport`（复制链接、下 HTML/PDF）；`?for=` 按朋友过滤应付

---

## 3. 已知坑 / 约束

| # | 点 | 说明 |
|---|---|---|
| 1 | 密钥 | 只放本地 `.env`；示例在 `*.env.example`；**禁止**提交真实 Key |
| 2 | prisma EPERM | Windows 上 server 跑着时 generate 可能锁 DLL → 先停进程 |
| 3 | 勿恢复 auto-sync | 不要把门票/leg 估价再写回 Expense |
| 4 | Sheet | 新 overlay 必须用 `components/Sheet` + OverlayProvider |
| 5 | 地图封装 | 禁止业务里直接 `new AMap`；只改 `MapView.tsx` |
| 6 | AA 色板 | 小票 hex 是刻意例外；主应用仍只用 `:root` token |

---

## 4. 未做 / 可选下一步

按优先级，**都不是阻塞日常使用**：

1. AI「自然语言微调」`/ai/adjust`（Tech-Design 有规格，**未实现**；现手改行程够用）
2. 体验打磨 / 旅行回顾（PRD 更远）
3. 用户若提新需求：先问是否 YAGNI，再动代码

---

## 5. 关键路径速查

| 路径 | 说明 |
|---|---|
| `web/src/pages/PlanPage.tsx` | 行程 Tab |
| `web/src/features/planner/MapView.tsx` | 高德封装 |
| `web/src/features/planner/DaySortableList.tsx` | 目录 + 参考价展示 |
| `web/src/features/budget/ExpensePanel.tsx` | 我的代付账本 UI |
| `web/src/features/budget/AaTicket.tsx` + `aaExport.ts` | AA 热敏小票 + 导出 |
| `web/src/features/budget/AaShareView.tsx` | `/share/:token` 的 AA 分支 |
| `web/src/pages/TripLayout.tsx` | 顶栏；行程分享 + AA 分享选朋友 |
| `web/src/components/MembersEditor.tsx` | 同行人（仅朋友） |
| `server/src/services/planner.service.ts` | 行程编排 + leg |
| `server/src/services/budget.service.ts` | 记账；`purgeEstimateLinkedExpenses` |
| `server/src/services/settlement.ts` | AA 净额 |
| `server/src/services/share.service.ts` | 只读快照 + AA snapshot / `filterAaSnap` |
| `server/.env` · `web/.env` | 本地密钥（gitignore） |

**本地启动**：仓库根目录 `npm run dev`（需已 `npm install`、`db:push`）。  
**远程**：`origin` → `https://github.com/Yqs0724/travel-app.git`，分支 `main`。
