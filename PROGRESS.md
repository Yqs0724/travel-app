# 行迹 TripTrace · 项目进度交接

> 日期：2026-09-15 ｜ 形态：个人自用 Web（移动端优先）｜ 文档：`PRD.md` / `Tech-Design.md` / `UI-design.md` / `Agents.md`

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
| 前端 | React 18 + TS + Vite + Tailwind + Zustand | 全栈 TS，Cursor 友好；不做暗色 |
| UI | 暖米色 token（`#FAF7F2` / `#EDE6DC` / `#C9A494` / `#6F584C` / `#1A1A1A`） | 纸感工具，非社区 |
| 后端 | Fastify + Prisma + SQLite WAL | 个人零运维；ORM 隔离便于日后切 Postgres |
| 地图 | 高德 JS Key（前端）+ Web Key（后端代理） | 服务端 Key 不泄露 |
| AI | OpenAI 兼容 LLM（可选） | 无 Key 时按行拆分地名仍可用 |
| 鉴权 | 访问密码 → JWT 7 天 | 分享接口除外（token 即权限） |

**Monorepo**：`web/` + `server/`（npm workspaces）。开发：`npm run dev` → web `127.0.0.1:5173`，server `:3000`。默认密码见 `server/.env` 的 `ACCESS_PASSWORD`（开发常用 `triptrace`）。

**数据原则**：行程（Trip → Day → Item + Leg）是唯一数据源；增删改排后服务端整包返回当天，前端不做本地推算。

---

## 2. 已完成核心功能

### 2.1 基础设施
- [x] Prisma 全量 schema（Trip / Day / Item / POI / Leg / Expense / Checklist / ShareLink）
- [x] 行程 CRUD、登录 JWT、统一 `{ code, data, message }`
- [x] Vite 绑定 `127.0.0.1`（避免仅 IPv6 导致打不开）
- [x] 前端 `isErr()` 判别 API 结果（收窄 TypeScript）

### 2.2 导航与壳
- [x] 登录后直进**最近更新**行程；无行程则新建页
- [x] 顶栏：`行程名 ▾`（切换/新建）+ `···`（编辑/删除/退出）；**无左上返回**
- [x] 底栏四 Tab：**行程 / AI / 清单 / 记账**（无独立地图 Tab）

### 2.3 行程 Tab（定稿：地图主视觉）
- [x] 切日芯片两行（第 N 天 / MM-DD·周X）；横滑、藏滚动条、右留白保证末颗完整
- [x] **地图为主**：当日有序编号针 1…N + `--accent` 连线；点针开半屏详情
- [x] **底部可拖抽屉**＝今日目录（序号+时刻+站名）；点行飞地图并开同一详情；选中行高亮
- [x] 切日：**居中标题**（第 N 天 · MM-DD 周X）+ **等宽点阵**；横滑胶囊芯片已废弃
- [x] 半屏：时刻/停留、交通、上移下移、删除；目录底「添加地点」（可搜 POI）
- [x] 已废弃：蛇形时间轴主视图、「列表|地图」分段、独立地图 Tab、横滑双行日期芯片

### 2.4 AI Tab
- [x] 粘贴笔记 → 提取地点（LLM 或按行拆分）→ 勾选 → 按天草稿（不落库）→ **确认写入**
- [x] 地理分天 + 最近邻排序在后端代码；不让 LLM 算距离

### 2.5 清单 / 记账
- [x] 清单：扁平列表，顶部输入 +「添加」，× 删除；常用套装折叠可选
- [x] 记账：分类记一笔、**编辑已有账单**、谁付/谁摊、AA；行程可管**同行人**；账单可附图


### 2.6 外部代理
- [x] `/api/v1/proxy/amap/poi`、`/route`（无 Key → 502 降级，手动路径仍可用）

### 2.7 只读分享 / 弱协作
- [x] `POST /api/v1/trips/:id/share`：生成或复用只读 token（同行程稳定链接）
- [x] `GET /api/v1/share/:token`：公开快照（无鉴权；不含账单/清单/成员）
- [x] 前端 `/share/:token`：地图 + 切日 + 目录抽屉只读；顶栏「行迹 · 只读」
- [x] `···` →「分享（只读）」→ 复制 `${origin}/share/:token`
- [x] **弱协作**：`POST .../share/edit` 设密码；分享页解锁 → editor JWT；写操作带 `expectedVersion` 防覆盖
- [x] 协作可记账 + 账单附图（jpg/png/webp，≤2MB）；解锁后「行程 | 记账」

---

## 3. 待确认问题

| # | 问题 | 现状 / 建议 |
|---|---|---|
| 1 | 高德 / LLM Key 是否配置 | 高德已配（`AMAP_WEB_KEY` + `VITE_AMAP_JS_KEY`）；LLM 仍可选 |
| 2 | 地图标记点级高亮 | 选中站：地图飞点 + 目录行 `bg-accent/25`（行程/分享页） |
| 3 | AI「自然语言微调」`/ai/adjust` | Tech-Design 有，**未实现**；当前够用：AI 写入后手改 |
| 4 | 天气 / 预约提醒 / 路况 | 天气+预约+**当天实时路况**已做 |
| 5 | 行程估价与账单 | **已改**：门票/路费仅作行程参考展示，不进账单；记账=我已支出，可选共同分摊 |

---

## 4. 下一步行动（建议顺序）

1. ~~联调体验 / 地图增强~~  
2. ~~P1 天气 + 预约~~  
3. ~~P1 门票/路费 → 预算联动~~ → **已改为不联动**：估价仅展示，账单手填（我的代付账本）  
4. ~~P1 清单与行程/天气智能推荐~~  
5. ~~P2 行程当天实时路况~~（`GET .../days/:dayId/traffic` + 当天路况图层）  

6. ~~P2 弱协作编辑（链接 + 密码）~~（`POST .../share/edit` + 解锁 JWT + `editVersion`）  

7. ~~行程点拖拽排序 / 分享链接失效 / 无 LLM 规则提取~~  

8. **更远（PRD）**  
   - 体验打磨；旅行回顾  

---

## 5. 关键路径速查

| 路径 | 说明 |
|---|---|
| `web/src/pages/PlanPage.tsx` | 行程 Tab：切日 + 地图 + 抽屉目录 |
| `web/src/features/planner/MapView.tsx` | 高德封装（编号、连线、点击、飞点） |
| `web/src/features/planner/ItemEditSheet.tsx` | 半屏详情 |
| `web/src/pages/SharePage.tsx` | 只读分享页 |
| `web/src/api/share.ts` | 分享 API |
| `web/src/pages/AiPage.tsx` + `features/ai/AiPlannerPanel.tsx` | AI 排程 |
| `web/src/pages/TripLayout.tsx` | 顶栏 ▾ / ···（含分享）、HomeRedirect |
| `server/src/services/planner.service.ts` | 行程编排 + leg 重算 |
| `server/src/services/share.service.ts` | 分享链接 + 公开快照 |
| `server/src/services/ai.service.ts` | 提取 / 草稿 / 写入 |
| `server/src/services/budget.service.ts` + `settlement.ts` | 记账 + AA |
| `server/.env` / `web/.env.example` | Key 与密码 |

**本地启动**：仓库根目录 `npm run dev`（需已 `npm install`、`db:push`）。
