import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { tripRoutes } from "./routes/trips.js";
import { plannerRoutes } from "./routes/planner.js";
import { proxyRoutes } from "./routes/proxy.js";
import { checklistRoutes } from "./routes/checklist.js";
import { budgetRoutes } from "./routes/budget.js";
import { aiRoutes } from "./routes/ai.js";
import { shareRoutes } from "./routes/share.js";
import { infoRoutes } from "./routes/info.js";
import { ok } from "./lib/response.js";
import { purgeEstimateLinkedExpenses } from "./services/budget.service.js";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const port = Number(process.env.PORT ?? 3000);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
  });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await authPlugin(app);

  // 一次性清掉行程估价误入的门票/路费账单（幂等）
  await purgeEstimateLinkedExpenses();

  app.get("/api/v1/health", async () => ok({ status: "ok" }));
  await authRoutes(app);
  await tripRoutes(app);
  await plannerRoutes(app);
  await proxyRoutes(app);
  await checklistRoutes(app);
  await budgetRoutes(app);
  await aiRoutes(app);
  await shareRoutes(app);
  await infoRoutes(app);

  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
