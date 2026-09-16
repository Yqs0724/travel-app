# 行迹 TripTrace

个人旅行规划工具。文档见 [PRD.md](./PRD.md)、[Tech-Design.md](./Tech-Design.md)、[UI-design.md](./UI-design.md)、[Agents.md](./Agents.md)。

## 开发

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env   # 填 VITE_AMAP_JS_KEY（可选）
npm install
npm run db:generate
npm run db:push
npm run dev:server   # :3000
npm run dev:web      # :5173，/api 代理到 :3000
```

默认访问密码见 `server/.env` 的 `ACCESS_PASSWORD`。

高德：
- Web 服务 Key → `server/.env` 的 `AMAP_WEB_KEY`（POI 搜索 / 路径耗时）
- JS API Key → `web/.env` 的 `VITE_AMAP_JS_KEY`（地图渲染）
未配置时手动编辑与时间轴仍可用。
