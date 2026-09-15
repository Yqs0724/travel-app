# 行迹 TripTrace 技术设计文档

> 版本：v1.0 ｜ 日期：2026-09-15 ｜ 对应 PRD：v1.1
> 前提：个人自用 Web 应用，移动端浏览器优先，本地/轻量服务器部署。

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
│   │   ├── planner/    # 行程规划（时间轴 + 地图）
│   │   ├── ai/         # AI 行程助手
│   │   ├── checklist/  # 物品清单
│   │   ├── budget/     # 记账与 AA
│   │   ├── info/       # 天气/预约提醒
│   │   └── share/      # 分享
│   ├── stores/         # Zustand store（按模块拆）
│   ├── hooks/          # 通用 hooks
│   ├── lib/            # 工具函数（日期/金额/地理计算）
│   ├── pages/          # 路由页面
│   └── App.tsx
└── index.html
```

### 3.2 关键前端决策

- **路由**：React Router，主路由 `/trips/:id/plan`、`/trips/:id/map`、`/trips/:id/budget`、`/trips/:id/checklist`、`/share/:token`（只读）。
- **地图封装**：`features/planner/MapView.tsx` 封装高德 JS API，POI 标注、连线、点击弹卡都在这一层，业务组件只传数据。
- **拖拽排序**：`dnd-kit`（时间轴 POI 拖拽）。
- **离线容错**：行程详情用 IndexedDB（`idb`）缓存，弱网下可查看已加载行程。
- **PWA**：加 manifest + Service Worker，手机桌面图标直达，接近 App 体验。

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
  members    String   // JSON: ["我","张三"]，用于 AA
  currency   String   @default("CNY")
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
  ticketPrice Float?       // 门票，联动预算
  needBook  Boolean  @default(false)  // 需预约
  bookAheadDays Int?                  // 提前 N 天预约
  bookUrl   String?
  note      String?
  day       TripDay  @relation(fields: [dayId], references: [id], onDelete: Cascade)
  legToNext TransportLeg?             // 到下一个 item 的交通段
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
  mode       String           // walk/transit/drive/bike/train/flight
  distanceM  Int?
  durationMin Int?
  cost       Float?           // 联动路费预算
  fromItem   ItineraryItem @relation(fields: [fromItemId], references: [id], onDelete: Cascade)
}

model Expense {
  id        String   @id @default(cuid())
  tripId    String
  category  String           // hotel/flight/food/ticket/transport/other
  amount    Float
  payer     String           // 付款人
  itemId    String?          // 可选关联行程条目
  date      DateTime
  note      String?
  splits    ExpenseSplit[]
  trip      Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
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
  id        String   @id @default(cuid())
  tripId    String
  token     String   @unique  // 随机 32 位
  canEdit   Boolean  @default(false) // V1.5 弱协作
  expiresAt DateTime?
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

### 5.3 设计说明

- **POI 独立成表**：充当本地缓存，同一地点多次使用不重复请求高德；`amapId` 为空表示用户手动创建。
- **seq 排序**：重排时批量更新 seq（前端一次性提交新顺序，后端事务更新），不做链表结构。
- **未来切 Postgres**：仅需改 Prisma datasource 和 JSON 字段类型，业务代码零改动。

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
| PATCH | `/api/v1/items/:id/leg` | 修改到下一地点的交通方式 ★ |

★ 标记的接口：**返回的不只是被改对象，而是重算后的整天日程**（耗时、时间顺延、预算影响），前端直接用响应刷新，保证各模块一致。

### 6.2 AI 助手

| Method | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/ai/extract-pois` | 输入：自由文本（小红书笔记等）；输出：候选 POI 列表（LLM 提取 + 高德校验坐标） |
| POST | `/api/v1/ai/plan` | 输入：tripId + 已确认 POI 列表 + 偏好；输出：按天分组的行程草稿（**不落库**，用户确认后才写入） |
| POST | `/api/v1/ai/adjust` | 自然语言微调当前行程（如"第三天去掉一个点"），输出 diff 供确认 |

### 6.3 预算与 AA

| Method | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/v1/trips/:id/expenses` | 账单列表 / 记账 |
| PATCH/DELETE | `/api/v1/expenses/:id` | 改 / 删 |
| GET | `/api/v1/trips/:id/settlement` | AA 结算方案（最简转账路径，实时计算不落库） |
| GET | `/api/v1/trips/:id/budget-summary` | 分类预算 vs 已花汇总 |

### 6.4 清单 / 信息 / 分享

| Method | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/trips/:id/checklist/from-template` | 按模板生成清单 |
| PATCH | `/api/v1/checklist-items/:id` | 打勾/改名 |
| GET | `/api/v1/trips/:id/weather` | 行程目的地天气（后端代理 + 1h 缓存） |
| GET | `/api/v1/trips/:id/booking-reminders` | 预约待办（按 bookAheadDays 算出应预约日期） |
| POST | `/api/v1/trips/:id/share` | 生成只读分享链接 |
| GET | `/api/v1/share/:token` | 只读行程快照（**无鉴权，仅 token，不暴露账单等隐私字段**） |

### 6.5 外部代理（隐藏服务端 Key）

| Method | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/proxy/amap/poi?keyword=` | POI 搜索补全 |
| GET | `/api/v1/proxy/amap/route?from=&to=&mode=` | 两点距离/耗时 |

---

## 7. 外部服务接入

| 服务 | 用途 | 调用方式 | 降级策略 |
|---|---|---|---|
| 高德 JS API | 地图渲染、标注、连线 | 前端直连（JS Key + 域名白名单） | 地图挂时列表视图照常可用 |
| 高德 Web 服务 | POI 搜索/坐标校验、路径规划、天气、实时路况 | 后端 providers/amap.ts（Web 服务 Key） | POI/路径失败 → 提示手动输入；天气失败 → 该卡片隐藏不阻塞 |
| LLM API | 笔记提取地点、生成/调整行程 | 后端 providers/llm.ts（OpenAI 兼容格式，baseURL 可配置） | 失败 → 保留纯手动建行程路径 |

**LLM 行程生成的 prompt 设计要点**（后端 ai.service 内实现）：
- 输入：POI 列表（含坐标、类别、营业时间）+ 行程天数 + 每日节奏偏好（紧凑/宽松）。
- 要求模型输出**严格 JSON Schema**（按天分组的 poiId 顺序 + 建议时间段），用 zod 校验，不合法自动重试 1 次。
- 地理聚类由后端代码做（按经纬度 k-means/贪心分组），**不让 LLM 算距离**——LLM 只负责在同集群内排序和填理由，降低幻觉。

---

## 8. 模块联动实现方案

PRD 第 6 节的联动规则，技术上用**「单事务重算 + 整包返回」**实现，不用事件总线（个人项目杀鸡不用牛刀）：

```
planner.service.ts
├── reorderItems(dayId, orderedIds)
│     1. 事务内更新 seq
│     2. 对受影响的相邻 item 调 providers/amap 重算 leg（带 POI 缓存）
│     3. 重算当日时间轴（startTime + duration + leg.duration 顺延）
│     4. 同步预算条目（门票/路费变动）
│     5. 返回重算后的整天数据
├── updateLeg(itemId, mode)      // 同上，触发 2→3→4→5
├── addItem / removeItem         // 同上，并增减预约提醒
└── updateTripDates(tripId, ...) // 触发天气重拉 + 预约倒计时重算
```

**规则**：任何前端操作后，UI 状态永远以服务端返回的重算结果为准，前端不做本地推算——这是"改一处、处处更新"不出错的关键。

AA 结算算法（budget.service）：净额法——每人应付 = 分摊总额 − 已付总额；正数为债权人、负数为债务人，贪心配对生成最简转账列表。

---

## 9. 安全与配置

- **鉴权**：个人自用，单用户——环境变量配置的访问密码，登录后签发 JWT（7 天有效）。分享链接接口除外（token 即权限）。
- **密钥管理**：所有 Key（高德 Web 服务/LLM/访问密码）只放 `server/.env`，`.env` 进 `.gitignore`，仓库内提供 `.env.example`。
- **限流**：Fastify rate-limit 插件，AI 接口单独限流（防 LLM 费用失控）。
- **备份**：SQLite 单文件，每日 cron 复制 `data.db` 到 `backups/` 保留 7 份。
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

*下一步：输出《UI-design.md UI 设计规范》（基于你提供的参考图配色：暖米色系 #FAF7F2 / #EDE6DC / #C9A494 / #6F584C / #1A1A1A）。*
