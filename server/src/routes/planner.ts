import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as planner from "../services/planner.service.js";

const poiSchema = z.object({
  name: z.string().min(1),
  lng: z.number(),
  lat: z.number(),
  amapId: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
});

const addSchema = z
  .object({
    customName: z.string().min(1).optional(),
    poi: poiSchema.optional(),
    startTime: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .optional(),
    durationMin: z.number().int().positive().optional(),
    ticketPrice: z.number().nonnegative().optional(),
    needBook: z.boolean().optional(),
    bookAheadDays: z.number().int().nonnegative().optional(),
    bookUrl: z.string().url().optional().or(z.literal("")),
    note: z.string().optional(),
    modeToNext: z.string().optional(),
    clientRequestId: z.string().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .refine((d) => d.customName || d.poi, { message: "需要名称或 POI" });

const updateSchema = z.object({
  customName: z.string().min(1).nullable().optional(),
  startTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .nullable()
    .optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  ticketPrice: z.number().nonnegative().nullable().optional(),
  needBook: z.boolean().optional(),
  bookAheadDays: z.number().int().nonnegative().nullable().optional(),
  bookUrl: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  clientRequestId: z.string().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
  clientRequestId: z.string().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const legSchema = z.object({
  mode: z.enum(["walk", "transit", "drive", "bike", "train", "flight"]),
  clientRequestId: z.string().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const deleteSchema = z.object({
  expectedVersion: z.number().int().nonnegative().optional(),
});

function handleErr(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  const err = e as Error & { code?: number };
  const code = err.code ?? 40001;
  const http = code === 40003 ? 404 : code === 40901 ? 409 : code === 40301 ? 403 : 400;
  return reply.status(http).send(fail(code, err.message));
}

async function assertEditorTrip(req: FastifyRequest, tripId: string | null) {
  const user = req.user;
  if (user.sub !== "editor") return;
  if (!tripId || tripId !== user.tripId) {
    throw Object.assign(new Error("无权编辑此行程"), { code: 40301 });
  }
}

export async function plannerRoutes(app: FastifyInstance) {
  app.post("/api/v1/days/:dayId/items", async (req, reply) => {
    const { dayId } = req.params as { dayId: string };
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      const tripId = await planner.tripIdForDay(dayId);
      await assertEditorTrip(req, tripId);
      if (tripId) await planner.bumpEditVersion(tripId, parsed.data.expectedVersion);
      const day = await planner.addItem(dayId, parsed.data);
      return reply.status(201).send(ok(await planner.attachEditVersion(day!)));
    } catch (e) {
      return handleErr(reply, e);
    }
  });

  app.patch("/api/v1/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      const tripId = await planner.tripIdForItem(id);
      await assertEditorTrip(req, tripId);
      if (tripId) await planner.bumpEditVersion(tripId, parsed.data.expectedVersion);
      const day = await planner.updateItem(id, parsed.data);
      return ok(await planner.attachEditVersion(day!));
    } catch (e) {
      return handleErr(reply, e);
    }
  });

  app.delete("/api/v1/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = deleteSchema.safeParse(req.body ?? {});
    const expectedVersion = parsed.success ? parsed.data.expectedVersion : undefined;
    try {
      const tripId = await planner.tripIdForItem(id);
      await assertEditorTrip(req, tripId);
      if (tripId) await planner.bumpEditVersion(tripId, expectedVersion);
      const day = await planner.removeItem(id);
      return ok(await planner.attachEditVersion(day!));
    } catch (e) {
      return handleErr(reply, e);
    }
  });

  app.put("/api/v1/days/:dayId/items/reorder", async (req, reply) => {
    const { dayId } = req.params as { dayId: string };
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      const tripId = await planner.tripIdForDay(dayId);
      await assertEditorTrip(req, tripId);
      if (tripId) await planner.bumpEditVersion(tripId, parsed.data.expectedVersion);
      const day = await planner.reorderItems(dayId, parsed.data.orderedIds);
      return ok(await planner.attachEditVersion(day!));
    } catch (e) {
      return handleErr(reply, e);
    }
  });

  app.patch("/api/v1/items/:id/leg", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = legSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail(40001, "参数无效"));
    }
    try {
      const tripId = await planner.tripIdForItem(id);
      await assertEditorTrip(req, tripId);
      if (tripId) await planner.bumpEditVersion(tripId, parsed.data.expectedVersion);
      const day = await planner.updateLeg(id, parsed.data.mode);
      return ok(await planner.attachEditVersion(day!));
    } catch (e) {
      return handleErr(reply, e);
    }
  });
}
