# 行迹 TripTrace 技术设计文档

> 版本：v1.2 ｜ 日期：2026-09-19 ｜ 对应 PRD：v1.2  
> v1.2：全程总览两段滑块、leg 可写 `durationMin`、大屏两列。点选测距不落库。冲突时以本文件 + [PROGRESS.md](./PROGRESS.md) 为准。

---

## 目录

1. [技术选型总览](#1-技术选型总览)
2. [系统架构](#2-系统架构)
3. [前端设计](#3-前端设计)
4. [后端设计](#4-后端设计)
5. [数据库设计](#5-数据库设计)
6. [API 设计](#6-api-设计)
7. [外部服务接入](#7-外部服务接入)
8. [模块联动实现方案](#8-模块联动实现方案)
9. [安全与配置](#9-安全与配置)
10. [部署方案](#10-部署方案)

---

## 1. 技术选型总览

| 层 | 选型 | 备选 | 理由 |
|---|---|---|---|
| 前端框架 | **React 18 + TypeScript + Vite** | Vue 3 | 生态最大、AI 编程工具（Cursor）对 React 支持最好；Vite 启动快 |
| UI 组件 | **Tailwind CSS + shadcn/ui** | Ant Design Mobile | 清爽年轻风格可定制性强，不像 AntD 千篇一律 |
| 状态管理 | **Zustand** | Redux Toolkit | 轻量，个人项目不需要 Redux 的样板代码 |
| 地图 | **高德地图 JS API 2.0 + Web 服务 API** | 腾讯地图 | PRD 已定高德；POI/路径/天气/路况一站全 |
| 后端框架 | **Node.js + Fastify + TypeScript** | Python FastAPI | 全栈同一种语言（TS），前后端共享类型定义，个人项目维护成本最低 |
| ORM | **Prisma** | Drizzle | Schema 即文档，迁移简单，Cursor 生成准确率高 |
| 数据库 | **SQLite（WAL 模式）** | PostgreSQL | 个人单用户场景 SQLite 完全够用、零运维；代码层面用 Prisma 隔离，未来可平滑切 Postgres |
| AI 能力 | **LLM API（兼容 OpenAI 格式）** | — | 行程生成、笔记提取地点 |
| 部署 | **单机：Node 进程 + Caddy/Nginx** | Docker | 见第 10 节 |

> **决策原则**：一个人 + AI 辅助开发，选「全栈 TypeScript」是为了减少上下文切换；选 SQLite 是为了零运维。两者都有明确的升级路径（Postgres / 拆服务），不锁死。

---

## 2. 系统架构

```
┌─────────────────────────────────────────────┐
│  浏览器（移动端优先 PWA）                      │
│  React SPA + 高德 JS API（地图渲染直连高德）     │
└──────────────┬──────────────────────────────┘
               │ HTTPS / REST JSON
┌──────────────▼──────────────────────────────┐
│  Node.js + Fastify 后端                      │
│  ├── routes/      API 路由层                 │
│  ├── services/    业务逻辑（联动重算在这里）     │
│  ├── providers/   外部服务封装（高德/天气/LLM）│
│  └── prisma/      数据访问                   │
└──────┬───────────────────┬──────────────────┘
       │                   │
┌──────▼──────┐   ┌────────▼─────────────────┐
│  SQLite     │   │  外部 API（后端代理调用）     │
│  data.db    │   │  高德 Web 服务 / 天气 / LLM │
└─────────────┘   └──────────────────────────┘
```

**关键设计**：
- **高德 Key 分离**：JS API Key（前端用，绑域名白名单）与 Web 服务 Key（仅后端持有，前端一律走 `/api/proxy/*` 代理），避免服务端 Key 泄露。
- **外部 API 全部走 providers 层封装**：业务代码不直接 fetch 外部接口，便于换源、加缓存、降级。
- **联动逻辑集中在 services 层**：见第 8 节。

---

## 3. 前端设计

### 3.1 目录结构

```
web/
├── src/
│   ├── api/            # API 客户端（fetch 封装 + 类型）
│   ├── components/     # 通用组件（Button/Card/BottomSheet...）
│   ├── features/       # 按业务模块划分（核心）
│   │   ├── planner/    # 行程（MapView + 目录抽屉 + 半屏）
│   │   ├── ai/         # AI 行程助手
│   │   ├── checklist/  # 物品清单
│   │   ├── budget/     # 代付账本 + AaTicket / aaExport
│   │   ├── info/       # 天气/预约提醒
│   │   └── share/      # （分享页逻辑也可在 pages/SharePage）
│   ├── stores/         # Zustand store（按模块拆）
│   ├── hooks/          # 通用 hooks
│   ├── lib/            # 工具函数（日期/金额/地理计算）
│   ├── pages/          # 路由页面
│   └── App.tsx
└── index.html
```

### 3.2 关键前端决策

- **路由**：`/trips/:id/plan|nearby|ai|checklist|budget`；`/trips/:id/map` → 重定向 `plan`；`/share/:token`（`kind=trip` 只读行程，或 `kind=aa` 小票；可选 `?for=`）。
- **地图封装**：仅 `features/planner/MapView.tsx`。单日：编号针 + 多色 leg + 中段标签（`交通 · 分 · km`），点标签改 mode 和 `durationMin`。总览见下。
- **全程总览**（`PlanPage`，`dayIndex === -1`）：与某一天互斥，点圆点 `goDay(i)` 进入该天。地图右上两段互斥滑块。`day` = 画出各天路线（按天着色）。`measure` = 点选测距（`measureIds` 按点击顺序；两点一条直线，≥3 封闭）。点线 `onCancelSpan` 去掉该边（`cutKeys`）；最后一条连选中一起清掉。点标签 `onEditSpan` 只改会话内 `spanOverrides`，刷新即丢，不调用 `updateLeg`。已删除且不要恢复：凸包外围、全部落点、跨天虚线、只看标点、总览内用圆点换 `mapDay` 预览。
- **大屏**：Tailwind `lg` = 1024px。`index.css` 里 `.plan-root` 两列：左 `.plan-head` + `.plan-sheet`，右 `.plan-map`（描边 + `box-shadow: 0 0 0 4px #ede6dc`）。顶栏 Tab 与「设置」在 `TripLayout` / `TripTabBar`。手机底栏不变。
- **周边**：`features/nearby/NearbyPanel.tsx`；锚点可选 + 关键词；半屏可跳转。
- **记账 UI**：`ExpensePanel`；AA 票：`AaTicket` + `aaExport`（链接/HTML/PDF）。
- **拖拽**：`dnd-kit`（已有则复用，不另引库）。
- **离线**：行程详情可用 IndexedDB 弱网查看；写失败必须明示。
- **PWA**：可选，非阻塞。

---

## 4. 后端设计

### 4.1 目录结构

```
server/
├── src/
│   ├── routes/         # 路由定义（每个资源一个文件）
│   ├── services/       # 业务逻辑层 ★
│   │   ├── trip.service.ts
│   │   ├── planner.service.ts    # 行程编排 + 联动重算
│   │   ├── budget.service.ts     # 记账 + AA 结算算法
│   │   ├── checklist.service.ts
│   │   └── ai.service.ts         # LLM 行程生成
│   ├── providers/      # 外部服务封装
│   │   ├── amap.ts     # 高德 POI/路径/天气/路况
│   │   └── llm.ts      # LLM API
│   ├── prisma/         # schema + 迁移
│   ├── plugins/        # Fastify 插件（错误处理/鉴权/限流）
│   └── index.ts
└── package.json
```

### 4.2 分层规则

- `routes/` 只做：参数校验（zod）→ 调 service → 返回统一响应，**不写业务逻辑**。
- `services/` 承载全部业务逻辑和模块联动，单元测试只测这一层。
- `providers/` 只做外部 IO，带超时（5s）、简单内存缓存（POI 详情缓存 24h）、失败降级。

### 4.3 统一响应格式

```json
// 成功
{ "code": 0, "data": { ... } }
// 失败
{ "code": 40001, "message": "行程不存在", "data": null }
```

错误码段：`400xx` 参数/资源类，`401xx` 鉴权类，`502xx` 外部服务故障（此时前端提示"已切换手动模式"）。

---

## 5. 数据库设计

> SQLite + Prisma。核心实体 8 张表，行程数据是唯一数据源。

### 5.1 ER 概览

```
Trip 1───N TripDay 1───N ItineraryItem N───1 POI
                          │ 1
                          └───N TransportLeg（到下一个点的交通段）
Trip 1───N Expense 1───N ExpenseSplit（分摊人）
Trip 1───N ChecklistItem
Trip 1───N ShareLink
```

### 5.2 Prisma Schema（核心字段）

```prisma
model Trip {
  id         String   @id @default(cuid())
  title      String
  startDate  DateTime
  endDate    DateTime
  members    String   // JSON：仅同行朋友 ["张三"]；「我」不入库，记账时固定 payer=「我」
  currency   String   @default("CNY")
  editVersion Int     @default(0) // 弱协作乐观锁
  days       TripDay[]
  expenses   Expense[]
  checklist  ChecklistItem[]
  shareLinks ShareLink[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model TripDay {
  id      String   @id @default(cuid())
  tripId  String
  date    DateTime
  note    String?
  trip    Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  items   ItineraryItem[]
  @@unique([tripId, date])
}

model ItineraryItem {
  id        String   @id @default(cuid())
  dayId     String
  seq       Int            // 当天排序序号
  poiId     String?
  poi       POI?     @relation(fields: [poiId], references: [id])
  customName String?       // 非 POI 的自定义条目（如"午睡"）
  startTime String?        // "14:30"
  durationMin Int?         // 预计停留
  ticketPrice Float?       // 门票估价：仅行程参考展示，禁止写入 Expense
  needBook  Boolean  @default(false)
  bookAheadDays Int?
  bookUrl   String?
  note      String?
  day       TripDay  @relation(fields: [dayId], references: [id], onDelete: Cascade)
  legToNext TransportLeg?
}

model POI {
  id        String  @id @default(cuid())
  amapId    String? @unique   // 高德 POI ID，有则坐标可信
  name      String
  lng       Float
  lat       Float
  city      String?
  category  String?           // 景点/餐厅/酒店/交通
  openHours String?
  rawJson   String?           // 高德原始返回，缓存用
}

model TransportLeg {
  id         String @id @default(cuid())
  fromItemId String @unique
  mode       String           // walk/transit/subway/drive/bike/train/flight
  distanceM  Int?
  durationMin Int?
  cost       Float?           // 路费估价：仅行程参考，禁止写入 Expense
  fromItem   ItineraryItem @relation(fields: [fromItemId], references: [id], onDelete: Cascade)
}

model Expense {
  id         String   @id @default(cuid())
  tripId     String
  category   String           // hotel/flight/food/ticket/transport/other
  amount     Float
  payer      String           // 恒为「我」（服务端强制）
  itemId     String?
  date       DateTime
  note       String?
  receiptExt String?          // jpg|png|webp
  splits     ExpenseSplit[]   // 个人=仅「我」；共同=「我」+朋友均分
  trip       Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
}

model ExpenseSplit {
  id        String  @id @default(cuid())
  expenseId String
  member    String
  ratio     Float   @default(1)  // 分摊比例，默认均摊
  expense   Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
}

model ChecklistItem {
  id       String  @id @default(cuid())
  tripId   String
  category String            // 证件/衣物/电子/药品/违禁品自查...
  name     String
  checked  Boolean @default(false)
  source   String  @default("custom") // template/ai/custom
  trip     Trip    @relation(fields: [tripId], references: [id], onDelete: Cascade)
}

model ShareLink {
  id           String    @id @default(cuid())
  tripId       String
  token        String    @unique
  canEdit      Boolean   @default(false)
  kind         String    @default("trip") // trip | aa
  passwordHash String?                 // 弱协作
  expiresAt    DateTime?
  trip         Trip      @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

### 5.3 设计说明

- **POI 独立成表**：本地缓存；`amapId` 为空=手动创建。
- **seq 排序**：一次提交有序 id 数组，后端事务更新。
- **members**：只存朋友；解析时过滤名为「我」的输入。
- **估价 ≠ 账单**：无 `syncDayBudget`；启动可 `purgeEstimateLinkedExpenses()`。
- **ShareLink.kind**：`trip` 快照剥离 expenses/checklist/members；`aa` 仅共同支出 + 结算字段（`othersOweMe` 等），支持按朋友名过滤。
- **未来切 Postgres**：改 datasource 即可。

---

## 6. API 设计

> 风格：REST + JSON，统一前缀 `/api/v1`。写操作幂等（客户端带 clientRequestId 防重复提交）。

### 6.1 行程核心

| Method | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/trips` | 行程列表 |
| POST | `/api/v1/trips` | 创建行程 |
| GET | `/api/v1/trips/:id` | 行程全量详情（含 days/items/legs，一次拉齐） |
| PATCH | `/api/v1/trips/:id` | 修改行程基本信息（改日期会触发提醒重算） |
| DELETE | `/api/v1/trips/:id` | 删除行程 |
| POST | `/api/v1/days/:dayId/items` | 添加行程条目 |
| PATCH | `/api/v1/items/:id` | 修改条目（时间/门票/预约标记） |
| DELETE | `/api/v1/items/:id` | 删除条目 |
| PUT | `/api/v1/days/:dayId/items/reorder` | 拖拽重排（body: 有序 itemId 数组）★ |
| PATCH | `/api/v1/items/:id/leg` | 改到下一站的交通方式；body 可带 `durationMin`（1–2880）★ |

★ 标记的接口：**返回重算后的整天日程**，前端整包替换。**不含**预算/账单同步。`updateLeg` 传入的 `durationMin` 在 `recomputeDay` 里会保留；只改交通方式、不传用时，则用路径规划的新耗时。点选测距不走这个接口。

### 6.2 AI 助手

| Method | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/ai/extract-pois` | 自由文本和/或截图 → 候选 POI（`mode=all|restaurants`；看图走多模态） |
| POST | `/api/v1/ai/plan` | 按天草稿，**不落库**，确认后写入 |
| POST | `/api/v1/ai/adjust` | 自然语言微调 → diff（已实现） |
| POST | `/api/v1/ai/chat` | 行程副驾驶对话（带本行程/清单上下文；`links` 跳转；`handoff` 可进提取/微调）。联网搜索未做 |

### 6.3 代付账本与结算

| Method | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/v1/trips/:id/expenses` | 列表 / 记账（服务端强制 `payer=我`） |
| PATCH/DELETE | `/api/v1/expenses/:id` | 改 / 删；可附图 |
| GET | `/api/v1/trips/:id/settlement` | 「朋友应付我」净额结果（实时算、不落库） |

> 已移除：分类「预算额度 vs 已花」汇总若仍存在仅为展示已花，**无**行程估价自动灌入。

### 6.4 清单 / 信息 / 分享

| Method | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/trips/:id/checklist/from-template` | 按模板生成 |
| PATCH | `/api/v1/checklist-items/:id` | 打勾/改名 |
| GET | `/api/v1/trips/:id/weather` | 天气（缓存） |
| GET | `/api/v1/trips/:id/booking-reminders` | 预约待办 |
| GET | `/api/v1/days/:dayId/traffic` | 当天实时路况 |
| POST | `/api/v1/trips/:id/share` | 生成/复用 `kind=trip` 只读链接 |
| POST | `/api/v1/trips/:id/share/aa` | 生成/复用 `kind=aa` 共同支出链接 |
| POST | `/api/v1/trips/:id/share/edit` | 弱协作：设密码 |
| GET | `/api/v1/share/:token` | 公开快照：trip 或 aa（无登录鉴权） |
| POST | `/api/v1/share/:token/unlock` | 弱协作解锁 → editor JWT |

### 6.5 外部代理（隐藏服务端 Key）

| Method | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/proxy/amap/poi?keyword=` | POI 搜索补全 |
| GET | `/api/v1/proxy/amap/around?lng=&lat=&types=&keywords=&radius=` | 周边搜索（餐饮/玩乐/厕所） |
| GET | `/api/v1/proxy/amap/route?from=&to=&mode=` | 两点距离/耗时 |

---

## 7. 外部服务接入

| 服务 | 用途 | 调用方式 | 降级策略 |
|---|---|---|---|
| 高德 JS API | 地图渲染、标注、连线 | 前端直连（JS Key + 域名白名单） | 地图挂时列表视图照常可用 |
| 高德 Web 服务 | POI 搜索/坐标校验、路径规划、天气、实时路况 | 后端 providers/amap.ts（Web 服务 Key） | POI/路径失败 → 提示手动输入；天气失败 → 该卡片隐藏不阻塞 |

路径规划：`walk`/`drive`/`bike` 走对应 direction；`subway`/`transit` 走 `v3/direction/transit/integrated`（逆地理取 city；地铁优先挑含地铁方案；失败再降级驾车）。无独立「纯地铁」接口。
| LLM API | 笔记提取地点、生成/调整行程 | 后端 providers/llm.ts（OpenAI 兼容格式，baseURL 可配置） | 失败 → 保留纯手动建行程路径 |

**LLM 行程生成的 prompt 设计要点**（后端 ai.service 内实现）：
- 输入：POI 列表（含坐标、类别、营业时间）+ 行程天数 + 每日节奏偏好（紧凑/宽松）。
- 要求模型输出**严格 JSON Schema**（按天分组的 poiId 顺序 + 建议时间段），用 zod 校验，不合法自动重试 1 次。
- 地理聚类由后端代码做（按经纬度 k-means/贪心分组），**不让 LLM 算距离**——LLM 只负责在同集群内排序和填理由，降低幻觉。

---

## 8. 模块联动实现方案

PRD 第 6 节用**「单事务重算 + 整包返回」**实现，不用事件总线：

```
planner.service.ts
├── reorderItems / updateLeg / addItem / removeItem
│     1. 事务内改 seq / mode / CRUD
│     2. providers/amap 重算相邻 leg（POI 缓存）
│     3. 若这次调用带了 durationMin，用它覆盖规划耗时；否则用规划结果。重排时把已有 durationMin 传回去，手动用时不被冲掉
│     4. **不**写 Expense（估价仅留在 item/leg 字段）
│     5. 返回重算后的整天数据
└── updateTripDates → 天气 / 预约倒计时重算
```

**规则**：UI 以服务端返回为准，前端不做本地推算。

**代付账本**（`budget.service` + `settlement.ts`）：
- 创建/更新时强制 `payer = 「我」`；个人 splits=`[我]`，共同=`[我, ...friends]` 均分。
- 结算：净额法；产品文案展示为各朋友 → 我 的应付额（`othersOweMe`）。
- AA 分享：`share.service` 组 `AaShareSnapshot`；可选按朋友名过滤；前端 `AaTicket`/`aaExport` 渲染（格式与色板见 UI-design §5.8.1）。

---

## 9. 安全与配置

- **鉴权**：访问密码 → JWT（7 天）。`GET /api/v1/share/:token` 除外（token 即权限）。
- **密钥**：高德 Web / LLM / 密码只放 `server/.env`；JS Key 仅 `web/.env` 的 `VITE_*`。
- **隐私**：`kind=trip` 剥离账单；`kind=aa` 仅共同支出。
- **限流**：AI 接口单独限流。
- **备份**：SQLite 文件复制即可。
- **输入校验**：全部入参过 zod schema，Prisma 参数化查询天然防注入。

---

## 10. 部署方案

**开发环境**：
```bash
# 根目录 monorepo（npm workspaces）
npm run dev        # 同时起 web(5173) 和 server(3000)，Vite 代理 /api → :3000
```

**个人服务器/本地长期使用**：
1. `npm run build`：前端产物由 Fastify 静态托管，单进程服务全部请求。
2. 进程管理用 `pm2`（或 Windows 下直接任务计划），Caddy 反代自动 HTTPS（有域名时）。
3. 数据库文件与 backups/ 目录独立于代码目录，升级不丢数据。

---

*文档与实现对齐：2026-09-16。视觉规范见 [UI-design.md](./UI-design.md)；进度见 [PROGRESS.md](./PROGRESS.md)。*
