import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fail } from "../lib/response.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: "owner" } | { sub: "editor"; tripId: string };
    user: { sub: "owner" } | { sub: "editor"; tripId: string };
  }
}

const PUBLIC_PREFIXES = ["/api/v1/auth/login", "/api/v1/share/", "/api/v1/health"];

function editorAllowed(path: string, tripId: string, method: string): boolean {
  if (path.startsWith("/api/v1/proxy/")) return true;
  if (path.startsWith("/api/v1/days/") || path.startsWith("/api/v1/items/")) return true;
  if (path.startsWith(`/api/v1/trips/${tripId}/expenses`)) return true;
  if (path === `/api/v1/trips/${tripId}/settlement`) return true;
  if (path === `/api/v1/trips/${tripId}/budget-summary`) return true;
  if (path.startsWith("/api/v1/expenses/")) return true; // 路由内再核 tripId
  if (path === `/api/v1/trips/${tripId}`) {
    return method === "GET" || method === "PATCH";
  }
  if (path === `/api/v1/trips/${tripId}/live`) return method === "POST";
  return false;
}

export async function authPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/")) return;
    if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))) return;

    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send(fail(40101, "未登录或令牌无效"));
    }

    const user = req.user;
    if (user.sub === "editor" && !editorAllowed(path, user.tripId, req.method)) {
      return reply.status(403).send(fail(40301, "协作账号仅可编辑行程与账单"));
    }
  });
}
