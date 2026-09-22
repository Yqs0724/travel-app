import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as ai from "../services/ai.service.js";
import * as aiChat from "../services/ai.chat.js";
import { bumpEditVersion } from "../services/planner.service.js";

function sendErr(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  const err = e as Error & { code?: number };
  const code = err.code ?? 40001;
  const http =
    code === 40003 ? 404 : code === 40901 ? 409 : code >= 50200 ? 502 : 400;
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
      .object({
        text: z.string().max(20_000).optional().default(""),
        city: z.string().optional(),
        mode: z.enum(["all", "restaurants"]).optional(),
        images: z
          .array(
            z.object({
              mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
              data: z.string().min(1).max(6_000_000),
            }),
          )
          .max(3)
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(
        await ai.extractPois(
          parsed.data.text,
          parsed.data.city,
          parsed.data.mode ?? "all",
          parsed.data.images ?? [],
        ),
      );
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/plan", async (req, reply) => {
    const parsed = z
      .object({
        tripId: z.string().min(1),
        pois: z.array(poiIn).min(1),
        sourceText: z.string().max(20_000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(
        await ai.buildPlan(parsed.data.tripId, parsed.data.pois, parsed.data.sourceText ?? ""),
      );
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
      await bumpEditVersion(parsed.data.tripId);
      return ok(await ai.commitPlan(parsed.data.tripId, parsed.data.days));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/adjust", async (req, reply) => {
    const parsed = z
      .object({
        tripId: z.string().min(1),
        instruction: z.string().min(1).max(500),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await ai.proposeAdjust(parsed.data.tripId, parsed.data.instruction));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/adjust/apply", async (req, reply) => {
    const opSchema = z.discriminatedUnion("op", [
      z.object({
        op: z.literal("move"),
        itemId: z.string().min(1),
        toDayIndex: z.number().int().nonnegative(),
        toSeq: z.number().int().nonnegative().optional(),
      }),
      z.object({
        op: z.literal("remove"),
        itemId: z.string().min(1),
      }),
      z.object({
        op: z.literal("setTime"),
        itemId: z.string().min(1),
        startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
      }),
      z.object({
        op: z.literal("rename"),
        itemId: z.string().min(1),
        name: z.string().min(1).max(80),
      }),
    ]);
    const parsed = z
      .object({
        tripId: z.string().min(1),
        ops: z.array(opSchema).min(1).max(20),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      await bumpEditVersion(parsed.data.tripId);
      return ok(await ai.applyAdjust(parsed.data.tripId, parsed.data.ops));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/ai/chat", async (req, reply) => {
    const parsed = z
      .object({
        tripId: z.string().min(1),
        message: z.string().min(1).max(4000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(4000),
            }),
          )
          .max(12)
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(
        await aiChat.chatAboutTrip(parsed.data.tripId, parsed.data.message, parsed.data.history ?? []),
      );
    } catch (e) {
      return sendErr(reply, e);
    }
  });
}
