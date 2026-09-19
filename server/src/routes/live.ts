import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import { prisma } from "../lib/prisma.js";
import * as live from "../services/live.service.js";

const bodySchema = z.object({
  clientId: z.string().min(8).max(64),
  name: z.string().min(1).max(24).optional(),
  sinceVersion: z.number().int().nonnegative().optional(),
});

export async function liveRoutes(app: FastifyInstance) {
  /** 心跳 + 版本探测：客户端每 ~2.5s 调一次 */
  app.post("/api/v1/trips/:id/live", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }

    const user = req.user;
    if (user.sub === "editor" && user.tripId !== id) {
      return reply.status(403).send(fail(40301, "无权访问此行程"));
    }

    const trip = await prisma.trip.findUnique({
      where: { id },
      select: { id: true, editVersion: true },
    });
    if (!trip) return reply.status(404).send(fail(40003, "行程不存在"));

    live.touchVersion(id, trip.editVersion);

    const role = user.sub === "editor" ? "editor" : "owner";
    const name =
      parsed.data.name?.trim() || (role === "owner" ? "主人" : "协作者");

    const peers = live.heartbeat(id, {
      clientId: parsed.data.clientId,
      name,
      role,
    });

    const since = parsed.data.sinceVersion;
    const changed = since != null && trip.editVersion !== since;

    return ok({
      editVersion: trip.editVersion,
      changed,
      peers,
    });
  });
}
