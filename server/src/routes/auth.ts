import type { FastifyInstance } from "fastify";
import { ok } from "../lib/response.js";

export async function authRoutes(app: FastifyInstance) {
  /** 无访问密码：点进首页即发 owner JWT */
  app.post("/api/v1/auth/login", async (_req, reply) => {
    const token = await reply.jwtSign({ sub: "owner" }, { expiresIn: "30d" });
    return ok({ token });
  });
}
