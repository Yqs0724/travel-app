import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as tripService from "../services/trip.service.js";

const createSchema = z.object({
  title: z.string().min(1).max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  members: z.array(z.string().min(1)).optional(),
  currency: z.string().optional(),
});

const updateSchema = createSchema.partial();

export async function tripRoutes(app: FastifyInstance) {
  app.get("/api/v1/trips", async () => ok(await tripService.listTrips()));

  app.post("/api/v1/trips", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      const trip = await tripService.createTrip(parsed.data);
      return reply.status(201).send(ok(trip));
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(400).send(fail(err.code ?? 40001, err.message));
    }
  });

  app.get("/api/v1/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await tripService.getTrip(id);
    if (!trip) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(trip);
  });

  app.patch("/api/v1/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      if (req.user.sub === "editor") {
        if (req.user.tripId !== id) {
          return reply.status(403).send(fail(40301, "无权编辑此行程"));
        }
        // 协作只允许改同行人（记账分摊用）
        const members = parsed.data.members;
        if (!members || Object.keys(parsed.data).some((k) => k !== "members")) {
          return reply.status(403).send(fail(40301, "协作账号仅可修改同行人"));
        }
        const trip = await tripService.updateTrip(id, { members });
        if (!trip) return reply.status(404).send(fail(40003, "行程不存在"));
        return ok(trip);
      }
      const trip = await tripService.updateTrip(id, parsed.data);
      if (!trip) return reply.status(404).send(fail(40003, "行程不存在"));
      return ok(trip);
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(400).send(fail(err.code ?? 40001, err.message));
    }
  });

  app.delete("/api/v1/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await tripService.deleteTrip(id);
    if (!deleted) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok({ id });
  });
}
