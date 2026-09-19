import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as tripService from "../services/trip.service.js";
import * as review from "../services/review.service.js";

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

  app.get("/api/v1/trips/:id/review", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await review.getTripReview(id);
    if (!data) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(data);
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

  app.get("/api/v1/trips/:id/pending", async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await tripService.getPending(id);
    if (!list) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(list);
  });

  app.put("/api/v1/trips/:id/pending", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        places: z.array(
          z.object({
            id: z.string().min(1),
            name: z.string().min(1).max(80),
            startTime: z.string().max(16).nullable().optional(),
            dayLabel: z.string().max(40).nullable().optional(),
            amapId: z.string().nullable().optional(),
            lng: z.number().nullable().optional(),
            lat: z.number().nullable().optional(),
            category: z.string().nullable().optional(),
          }),
        ),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    const list = await tripService.setPending(id, parsed.data.places);
    if (!list) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(list);
  });

  app.post("/api/v1/trips/:id/pending", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        places: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              startTime: z.string().max(16).nullable().optional(),
              dayLabel: z.string().max(40).nullable().optional(),
              amapId: z.string().nullable().optional(),
              lng: z.number().nullable().optional(),
              lat: z.number().nullable().optional(),
              category: z.string().nullable().optional(),
            }),
          )
          .min(1)
          .max(80),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    const list = await tripService.appendPending(id, parsed.data.places);
    if (!list) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(list);
  });
}
