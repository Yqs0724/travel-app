# 行迹 TripTrace · 项目进度交接

> 日期：**2026-09-19** ｜ 形态：个人自用 Web（手机优先，`lg`≥1024 大屏）  
> 文档：`PRD.md` / `Tech-Design.md` / `UI-design.md` / `Agents.md`  
> GitHub：https://github.com/Yqs0724/travel-app （当前分支 **`NEW2`**，跟踪 `origin/NEW2`；本地 `.env` **不**入库）

---

## 0. 新窗口接续（先读这里）

### 怎么开干
1. 读本文件 §0–§2 + `Agents.md` 硬规则；改 UI 再看 `UI-design.md`。
2. 仓库根：`npm install` → `npm run db:generate` → `npm run db:push` → `npm run dev`  
   - web `127.0.0.1:5173`（本机）或 `http://<电脑局域网IP>:5173`（手机同 WiFi）；server `:3000`，`/api` 已代理。  
   - Vite 已监听 `0.0.0.0`；若手机打不开，检查 Windows 防火墙是否放行 5173。  
   - Key/密码在本地 `server/.env`、`web/.env`（参考 `*.env.example`）。开发常用密码 `triptrace`。
3. **Windows**：PowerShell 不要用 `&&` 串命令；`prisma generate` 若 EPERM，先停掉占用 `server` 的 node 再生成。

### 当前状态（一句话）
**可用个人版在 `NEW2`。** HEAD **`1e73cc5`**。线上 `114.132.103.15` PM2 `triptrace` :3003 **已部署**（含本地测试 `data.db`）。不要动 Docker `ai-phone:3001` 和 PM2 `trip:3002`。

本地预览：仓库根 `npm run dev`。Vite `http://localhost:5173/` 把 `/api` 代理到 Fastify `127.0.0.1:3000`。常用预览行程 `cmu2b47mp0008v6s4scf2tibn`（成都，2026-10-03～10-09）。

### 最近定稿决策（勿回退）
| 主题 | 定稿 |
|---|---|
| 记账心智 | **我的代付账本**：只记「我已支出」；`payer` 固定为成员「我」；个人=不勾共同，共同=勾选朋友均分；结算文案 **朋友应付我** |
| 估价 vs 账单 | 门票/路费只在行程列表显示 **参考价**，**绝不**自动进 Expense；`syncDayBudget` 已删；启动时 `purgeEstimateLinkedExpenses()` 清历史脏数据 |
| 同行人 | 成员列表 UI **只编辑朋友**（≥1）；「我」由后端保证，解析时过滤名叫「我」的输入 |
| 分享两种 | `ShareLink.kind`：默认行程只读；`kind=aa` = 共同支出小票（不含个人账单） |
| AA 小票 UX | 面向朋友：无朋友姓名印在票上；分享时选收件人 → `?for=` 过滤应付额；热敏收据风；**禁止**橙强调色 |
| AA 小票视觉 | 单框线、底撕边；顶猫爪 / 底狗爪；半价金额用 `#D1DECD` 的 `\` 划掉 + 右上 `50%`；色板 `#F7F7F7` / `#D1DECD` / `#BEC0BC` / `#749469` / `#548046`（**仅** `AaTicket`/`aaExport` 例外于全局暖米色 token） |
| 地图 | 见下方「地图定稿」。不要把已经删掉的模式加回来 |
| 底栏 | 手机底栏五项。大屏（`lg`）同一套 Tab 挪到顶栏右侧，旁边是「设置」（手机仍是 `···`「更多」） |
| 周边 | 锚点可选；关键词自搜；芯片餐饮/玩乐/厕所；半屏「周边」「找厕所」带 `itemId`+`mode` |
| AI | 笔记→草稿写入；点评→仅候选复制；可上传截图看图（多模态 LLM，如 `deepseek-flash`） |

### 地图定稿（2026-09-19，勿回退）

全程总览是切日点阵的第 0 点（`dayIndex === -1`），在第 1 天前面。打开行程默认停在全程总览，换行程也回到总览。**总览与某一天互斥**：点阵同一时刻只能选中一个；点某天圆点直接进入该天，不留在总览里换「预览天」。

地图右上角两段滑块，互斥，默认 **当天路线**：

| 模式 | 行为 |
|---|---|
| 当天路线 | 总览里画出**各天**的针和路线（按天着色）。点圆点进入那一天 |
| 点选测距 | 所有天的针都在。点针选中（蓝圈 `#1D4E89`），再点取消。两点一条直线，三点起按点击顺序封闭。点线取消这一条；点线上的标签改交通和用时，**不要**取消线。选点时不要自动缩放或平移地图。不打开行程编辑，不跳进某一天 |

已删除、不要加回来：外围连线 / 外围测距、全部落点、跨天灰色虚线、只看标点、总览内用圆点换「预览天」不离开总览。点选测距已经能看到全部落点。

地点可在半屏勾「地图上隐藏」：不画该针，前后景点仍连线；不改已存路段。

路线标签格式：`交通 · N分 · Xkm`。当天路线里点标签会打开「编辑这段路程」，交通方式和用时都写入 `PATCH /items/:id/leg`（`durationMin` 1–2880）。重排时手动用时保留。点选测距的修改只活在这次会话（`spanOverrides`），刷新回到驾车估算，**不要**写成 `updateLeg`（跨天没有存储的 leg）。测距线是白色，细描边 `#6F584C`；标签白底深字。选中针的圈仍是蓝色。

交通：高德**没有**独立「纯地铁」Web 接口；`subway` / `transit` 都走 `v3/direction/transit/integrated`（逆地理取 city）。选「地铁」用 strategy=0 并优先含地铁/轨交的方案；选「公交」用 strategy=5（尽量不乘地铁）。规划失败再降级驾车。默认新建路段是驾车。自检：`server/src/providers/amap.transit.selfcheck.ts`。

本行程每天从酒店出发时：添加地点表单会列出「本行程地点」（已有坐标，去重）；点酒店即可复用，不必重新搜。仅填同名名称添加时，后端也会挂上本行程已有同名 POI。无坐标的旧点可在编辑半屏点选本行程地点补坐标。

单日页忽略总览滑块，永远画当天路线；点针仍打开编辑。总览目录行点击进入那一天。停留时刻已从行程 UI 拿掉，交通用时保留。当天地点可一键清空。删整趟行程在 `···` / 设置里，已有。

AI Tab 为对话壳（桌面左侧历史+新对话；手机顶栏历史/新对话）。可问本行程与清单并带跳转；「行程助手 · 贴笔记」打开原提取流程；改行程走确认后写入。联网搜索后做。

### 提交注意
未提交改动不要带上 `deploy/`（里面有服务器口令）和仓库根目录的 jpg。用户没说提交就不要提交，没说部署就不要部署。

### 新窗口建议首句（可粘贴）
> 继续开发行迹 TripTrace（`d:\cursor-projects\旅游app`，分支 `NEW2`）。先读 `PROGRESS.md` §0 与 `Agents.md`。大屏布局和全程总览（当天路线 / 点选测距）已在本地，未提交、未部署。不要恢复外围连线、全部落点、估价→账单同步。记账保持「我的代付账本」。不要提交 `deploy/` 和根目录 jpg。本地 `.env` 已有。

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
| AI | OpenAI 兼容 LLM（可选，可多模态） | 无 Key 时纯文字仍可规则拆地名；看图必须有视觉模型 |
| 鉴权 | 访问密码 → JWT 7 天 | 分享接口除外（token 即权限） |

**数据原则**：行程（Trip → Day → Item + Leg）是唯一数据源；增删改排后服务端整包返回当天，前端不做本地推算。

---

## 2. 已完成核心功能

### 2.1–2.4 基建 / 壳 / 行程地图 / AI
- [x] Prisma 全量 schema；JWT；`{ code, data, message }`；Vite `127.0.0.1`
- [x] 顶栏行程切换 + `···`；底栏 **行程 / 周边 / AI / 清单 / 记账**
- [x] 行程 Tab：切日点阵（含全程总览）+ MapView + 目录。手机：地图上、抽屉下。大屏：左目录、右带框地图；顶栏右侧是 Tab +「设置」
- [x] 当天路线 / 点选测距；路线标签改交通和用时；测距线可点掉。细节见 §0，代码主要在 `PlanPage.tsx` 与 `MapView.tsx`（未提交）
- [x] 周边 Tab：关键词搜 / 锚点餐饮·玩乐·厕所；`proxy/amap/around`
- [x] AI：笔记提取 → 勾选 → 草稿 → 确认写入；点评仅候选；可截图看图；地理分天在后端，禁止 LLM 算距离

### 2.5 清单 / 记账（代付账本）
- [x] 清单：扁平列表 + 常用套装；天气/行程智能推荐已接
- [x] 记账：`ExpensePanel` = 我的支出列表 + 共同开关 + 朋友应付我；可编辑、可附图
- [x] 同行人：`MembersEditor` 只管朋友；结算 `settlement.ts` 净额法

### 2.6 外部代理
- [x] `/api/v1/proxy/amap/poi`、`/route`、`/around`（无 Key → 502，手动路径仍可用）
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
| 7 | 地图色 | `MapView` 里的针色、测距白线、选中蓝圈是地图绘制，不要为了「JSX 禁止 hex」改回高德默认蓝 |
| 8 | 未提交 | 大屏和总览在工作区，不在 `75f1b51`。部署前先提交；提交时排除 `deploy/` 和根目录 jpg |

---

## 4. 未做 / 可选下一步

按优先级，**都不是阻塞日常使用**：

1. AI 联网搜索（行程副驾驶已上；全网检索后做）
2. 体验打磨 / 旅行回顾（PRD 更远）
3. 用户若提新需求：先问是否 YAGNI，再动代码
4. 若要上线：先提交 `NEW2`（排除 `deploy/`、jpg），`npm run build` 后再部署到 PM2 `triptrace` :3003。本地若用 `http://127.0.0.1:3000` 看打包结果，改完前端必须重新 `npm run build`，否则仍是旧 JS；开发请用 `http://localhost:5173`（Vite 热更新）。`server` 静态资源 `wildcard` 须为 true，否则 `/assets/*` 会回退成 `index.html` 导致白屏。不要覆盖 :3001 / :3002

---

## 5. 关键路径速查

| 路径 | 说明 |
|---|---|
| `web/src/pages/PlanPage.tsx` | 行程 Tab |
| `web/src/pages/NearbyPage.tsx` | 周边 Tab |
| `web/src/features/nearby/NearbyPanel.tsx` | 周边搜索 / 厕所 / 加入 |
| `web/src/features/planner/MapView.tsx` | 高德封装 |
| `web/src/features/planner/DaySortableList.tsx` | 目录 + 参考价展示 |
| `web/src/features/planner/ItemEditSheet.tsx` | 半屏编辑 + 周边入口 |
| `web/src/features/ai/AiChatPanel.tsx` | AI 对话壳（历史 / 新对话 / 跳转） |
| `web/src/features/ai/AiPlannerPanel.tsx` | 行程助手：笔记/点评/截图提取 |
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
**远程**：`origin` → `https://github.com/Yqs0724/travel-app.git`，当前开发分支 `NEW2`（`origin/NEW2`）。工作区比 `75f1b51` 多出的大屏/总览改动尚未提交。
