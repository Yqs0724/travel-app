import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = z.object({ password: z.string().min(1) }).safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send(fail(40001, "密码不能为空"));
    }
    const expected = process.env.ACCESS_PASSWORD ?? "triptrace";
    if (body.data.password !== expected) {
      return reply.status(401).send(fail(40102, "密码错误"));
    }
    const token = await reply.jwtSign({ sub: "owner" }, { expiresIn: "7d" });
    return ok({ token });
  });
}
