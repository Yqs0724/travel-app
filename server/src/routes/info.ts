import type { FastifyInstance } from "fastify";
import { fail, ok } from "../lib/response.js";
import * as info from "../services/info.service.js";

export async function infoRoutes(app: FastifyInstance) {
  app.get("/api/v1/trips/:id/weather", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const data = await info.getTripWeather(id);
      if (!data) return reply.status(404).send(fail(40003, "行程不存在"));
      return ok(data);
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(502).send(fail(err.code ?? 50201, err.message));
    }
  });

  app.get("/api/v1/trips/:id/booking-reminders", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await info.getBookingReminders(id);
    if (!data) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(data);
  });

  app.get("/api/v1/trips/:id/days/:dayId/traffic", async (req, reply) => {
    const { id, dayId } = req.params as { id: string; dayId: string };
    try {
      const data = await info.getDayTraffic(id, dayId);
      if (!data) return reply.status(404).send(fail(40003, "日程不存在"));
      return ok(data);
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(502).send(fail(err.code ?? 50201, err.message));
    }
  });
}
