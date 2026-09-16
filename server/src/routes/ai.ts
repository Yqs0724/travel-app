import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as ai from "../services/ai.service.js";

function sendErr(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  const err = e as Error & { code?: number };
  const code = err.code ?? 40001;
  const http = code === 40003 ? 404 : code >= 50200 ? 502 : 400;
  return reply.status(http).send(fail(code, err.message));
}

const poiIn = z.object({
  name: z.string().min(1),
  amapId: z.string().nullish(),
  lng: z.number().nullish(),
  lat: z.number().nullish(),
  city: z.string().nullish(),
  category: z.string().nullish(),
});

const draftDay = z.object({
  dayId: z.string().min(1),
  date: z.string(),
  items: z.array(
    z.object({
      name: z.string().min(1),
      amapId: z.string().nullish(),
      lng: z.number().nullish(),
      lat: z.number().nullish(),
      city: z.string().nullish(),
      category: z.string().nullish(),
      startTime: z.string().nullish(),
      durationMin: z.number().int().positive(),
    }),
  ),
});

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/v1/ai/extract-pois", async (req, reply) => {
    const parsed = z
      .object({ text: z.string().min(1).max(20_000), city: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await ai.extractPois(parsed.data.text, parsed.data.city));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/plan", async (req, reply) => {
    const parsed = z
      .object({
        tripId: z.string().min(1),
        pois: z.array(poiIn).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await ai.buildPlan(parsed.data.tripId, parsed.data.pois));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/commit", async (req, reply) => {
    const parsed = z
      .object({
        tripId: z.string().min(1),
        days: z.array(draftDay).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await ai.commitPlan(parsed.data.tripId, parsed.data.days));
    } catch (e) {
      return sendErr(reply, e);
    }
  });
}
