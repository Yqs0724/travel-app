# 行迹 TripTrace · AI 编程助手规则

> 给 Cursor 用。改代码前读本文件 + [PRD.md](./PRD.md) + [Tech-Design.md](./Tech-Design.md) + [UI-design.md](./UI-design.md) + [PROGRESS.md](./PROGRESS.md)。
> 冲突时：PRD 定做什么 → Tech-Design 定怎么做 → UI-design 定长什么样 → 本文件定怎么写代码。设计文档已于 2026-09-19 对齐全程总览和大屏；未提交的进度以 [PROGRESS.md](./PROGRESS.md) §0 为准。
> 行程主视图：**地图 + 切日点阵（第 0 点是全程总览）+ 目录**。手机地图在上、目录在下；`lg`≥1024 左目录、右带框地图。无独立地图 Tab、无蛇形时间轴。

---

## 目录

1. [角色与总原则](#1-角色与总原则)
2. [仓库与目录](#2-仓库与目录)
3. [技术约束（硬规则）](#3-技术约束硬规则)
4. [代码规范](#4-代码规范)
5. [模块联动与数据](#5-模块联动与数据)
6. [UI 实现约束](#6-ui-实现约束)
7. [开发流程](#7-开发流程)
8. [禁止清单](#8-禁止清单)

---

## 1. 角色与总原则

- 个人自用 Web 工具，一个人 + AI 维护。少写代码，先复用本仓库已有 helper。
- **行程是唯一数据源**。改 POI / 交通 / 日期，只在 `planner.service` 里重算，禁止前端或其它 service 再推算一份。
- 外部 API（高德 / 天气 / LLM）挂了，**手动编辑路径必须仍可用**。
- 不做：UGC 社区、OTA 交易、自动抓小红书、暗色模式（V1）、实时多人协同（V2 才考虑）。

---

## 2. 仓库与目录

npm workspaces monorepo：`web/` + `server/`。新文件对号入座，禁止在根目录堆业务代码。

```
web/src/
  api/            # fetch 封装 + 类型
  components/     # 通用 UI（Button/Card/Sheet），不含业务
  features/       # 按模块：planner | nearby | ai | checklist | budget | info | share
  stores/         # Zustand，按模块拆，不搞全局上帝 store
  hooks/          # 跨模块 hooks
  lib/            # 日期 / 金额 / 地理纯函数
  pages/          # 路由页，只拼 features
server/src/
  routes/         # zod 校验 → 调 service → 统一响应。禁止写业务
  services/       # 全部业务与联动；单测只打这里
  providers/      # amap.ts / llm.ts，禁止业务里直接 fetch 外部
  prisma/         # schema + 迁移
  plugins/        # 错误处理 / JWT / 限流
```

路由（不要自创路径）：

- `/trips`（登录后重定向最近行程或新建）、`/trips/:id/plan`、`/trips/:id/nearby`、`/trips/:id/ai`、`/trips/:id/checklist`、`/trips/:id/budget`
- `/trips/:id/map` → 重定向到 `plan`（保留兼容，勿再做独立地图页）
- `/share/:token`：`kind` 默认=行程只读（同构地图+目录，无账单）；`kind=aa`=共同支出小票（`AaShareView`，可带 `?for=`）
- API 前缀 `/api/v1`

---

## 3. 技术约束（硬规则）

| 项 | 必须 | 禁止 |
|---|---|---|
| 语言 | 全栈 TypeScript | 新加 Python/Go 服务 |
| 前端 | React 18 + Vite + Tailwind + shadcn + Zustand + React Router | Redux、AntD、再加一套 UI 库 |
| 拖拽 | `dnd-kit` | 再引入别的 dnd |
| 地图 | 高德 JS API 只进 `features/planner/MapView.tsx` | 业务组件直接 `new AMap` |
| 后端 | Fastify + Prisma + SQLite WAL | 业务里手写 SQL 拼接 |
| 校验 | 入参 zod | 信任前端未校验数据 |
| 密钥 | 只放 `server/.env`；JS Key 前端、Web 服务 Key 仅后端 | 把 Web 服务 Key / LLM Key 写进 `web/` |
| 代理 | POI 搜索、周边搜索、路径规划走 `/api/v1/proxy/amap/*` | 前端直调高德 Web 服务 |
| 响应 | `{ code, data, message? }`；`code===0` 成功 | 每张接口一种 envelope |
| 错误码 | `400xx` 参数/资源，`401xx` 鉴权，`502xx` 外部故障 | 用 HTTP 200 塞随机字符串当错误 |

鉴权：环境变量访问密码 → JWT（7 天）。`GET /api/v1/share/:token` 除外（行程只读或 AA 账单 kind）。行程分享不得返回个人账单；`kind=aa` 仅返回共同支出 + 附图。

LLM：只经 `providers/llm.ts`（OpenAI 兼容、baseURL 可配；可多模态看图）。输出必须 JSON Schema + zod 校验，失败重试 1 次。地理聚类用代码算，**禁止让模型算距离**。AI 草稿不落库，用户确认后才写 Prisma。看图提取景点/餐饮需多模态模型（如 `deepseek-flash`）；无图时无 Key 仍可规则拆地名。

providers：超时 5s；POI 详情内存缓存 24h；天气缓存 1h。

---

## 4. 代码规范

- 组件：函数组件 + 具名导出优先；文件名 `PascalCase.tsx`（组件）、`camelCase.ts`（工具/service）。
- 类型：能推断不重复写；跨端 DTO 放共享类型（建 `shared/` 或 server 导出类型给 web），禁止复制粘贴两份 interface。
- 命名：行程 `trip`，条目 `item`，交通段 `leg`，费用 `expense`。不要 `journey` / `spot` 混用。
- Prisma 字段名跟 [Tech-Design.md](./Tech-Design.md) schema 走，改 schema 必须 `prisma migrate`，禁止只改 TS 类型。
- 金额：后端 `Float` 按「元」；展示两位小数。结算用净额法 + 贪心配对（`settlement.ts`），前端展示为「朋友应付我」。
- 排序：`seq` 整数；重排一次提交有序 id 数组，后端事务更新。不做链表。
- 注释：只写非显而易见的约束（例如「前端不本地推算耗时」）。用中文或英文均可，同一文件内统一。
- 非平凡逻辑留**一个**可跑的检查：`*.test.ts` 或 `scripts/` 下 assert 自检。不引入 Jest 全家桶以外的新测试框架（已有什么用什么；没有则用 node 内置 `node:test`）。

---

## 5. 模块联动与数据

前端**不以本地推算为准**。下列接口返回**重算后的整天日程**，store 整包替换：

- `PUT /days/:dayId/items/reorder`
- `PATCH /items/:id/leg`
- 增删 item 的响应同样带整天数据

`planner.service` 单事务顺序：改 seq / 改 mode → 调 `providers/amap` 重算相邻 leg（走 POI 缓存）→ 顺延当日时刻 → 返回整天。门票/路费估价只留在行程字段，**不**自动写入账单。

记账模型：只记「我掏出去的钱」；`payer` 固定同行人首位；个人=`splits` 仅自己，共同=勾选朋友均分；结算文案为「朋友应付我」。

触发联动对照 PRD 第 6 节，缺一条就是 bug，不要只改当前屏幕。

IndexedDB（`idb`）只缓存已加载行程详情，供弱网**查看**。写操作失败要明确提示，禁止静默当成功。

---

## 6. UI 实现约束

严格按 [UI-design.md](./UI-design.md)：

- 颜色只来自 `web/src/index.css` 的 `:root` 变量。JSX/Tailwind 禁止新 hex。**唯一例外**：`AaTicket` / `aaExport` 热敏小票用独立青绿色板（见 PROGRESS §0），勿把橙强调色加回去。
- 间距只准 4/8/12/16/24；卡片圆角 20；触控高度 ≥ 44。
- 行程内底栏五项：**行程 / 周边 / AI / 清单 / 记账**（无独立地图 Tab）。`lg` 起这五项在顶栏右侧，手机「更多」写成「设置」。
- 行程 Tab：切日点阵（含全程总览）+ MapView + 目录。总览与某一天互斥，点圆点进入该天。总览滑块只有「当天路线」「点选测距」，默认当天路线（总览画各天路线）。点测距线取消该线；点标签改信息。测距的改动不落库。不要恢复外围连线、全部落点、跨天虚线、只看标点。
- 周边 Tab：关键词自搜 + 可选锚点 + 餐饮/玩乐/厕所推荐；半屏可跳入。
- 停留时刻不在行程 UI 展示；交通用时保留。当天可一键清空。
- 地图挂了时目录与半屏仍可编辑。LLM 挂了：手动加地点仍可用。
- **新 overlay 必须用 `components/Sheet`（含 OverlayProvider 互斥）**；禁止再手写 `fixed inset-0` + `bg-ink/*` 遮罩。目录在大屏是左栏，不算阻断 Sheet。
- `MapView` 里的针色、白测距线、选中蓝圈可以写 hex；其它 JSX 仍只用 token。AA 小票色板是另一处例外。
- V1 不做暗色模式、不做 Lottie、不做新字体包。

---

## 7. 开发流程

1. 先读将改模块的 PRD 小节 + Tech-Design 对应节 + 本文件第 3、5 节。
2. 能改现有 service 一处解决，就不要加新抽象层。
3. 先实现手动闭环，再接 AI / 天气 / 路况。外部依赖用 provider 假数据也能跑通页面。
4. 改联动：同时打开目录/地图数据、预算相关调用点，确认只在 service 算一次。
5. 本地：`npm run dev`（web 5173，server 3000，Vite 代理 `/api`）。不要把 Key 写进命令行历史能看到的文档。
6. 提交前：类型能过、手动路径能用、`.env` 未入库。

V1.0 已落地主线。当前分支 `NEW2`，HEAD `75f1b51` 之后的大屏和全程总览还在工作区。接续先读 **PROGRESS.md §0**。

---

## 8. 禁止清单

- 爬取小红书或任何未授权站点。
- 为「演示方便」把 Key 写进前端或 README。
- 新增依赖前问：标准库 / 已装包是否已够（YAGNI）。
- 事件总线、微服务、Postgres「顺便」迁移、Docker 全家桶——未在 Tech-Design 出现的架构不要自作主张。
- 分享页夹带隐私字段。
- 用 LLM 生成的距离/耗时覆盖高德结果。
- 假大空注释、无调用方的 util 文件、提前做 V1.5/V2 功能。
- 把已删的总览模式（外围连线、全部落点、跨天虚线、只看标点）加回来。
- 把点选测距的交通/用时写成 `updateLeg` 或新表。要持久化时先问。
- 提交 `deploy/` 或仓库根目录的 jpg。用户没要求就不要提交、不要部署。线上只动 PM2 `triptrace`（3003），不要动 `ai-phone:3001` 和 `trip:3002`。
