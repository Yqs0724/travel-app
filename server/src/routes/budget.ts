import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as budget from "../services/budget.service.js";

const cats = ["hotel", "flight", "food", "ticket", "transport", "other"] as const;

function sendErr(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  const err = e as Error & { code?: number };
  const code = err.code ?? 40001;
  const http = code === 40003 ? 404 : code === 40301 ? 403 : 400;
  return reply.status(http).send(fail(code, err.message));
}

const addSchema = z.object({
  category: z.enum(cats),
  amount: z.number().positive(),
  /** 兼容旧客户端；服务端固定为「我」 */
  payer: z.string().min(1).max(40).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(200).optional(),
  splits: z
    .array(z.object({ member: z.string().min(1), ratio: z.number().positive().optional() }))
    .optional(),
  clientRequestId: z.string().optional(),
});

const updateSchema = z.object({
  category: z.enum(cats).optional(),
  amount: z.number().positive().optional(),
  payer: z.string().min(1).max(40).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(200).nullable().optional(),
  splits: z
    .array(z.object({ member: z.string().min(1), ratio: z.number().positive().optional() }))
    .min(1)
    .optional(),
  clientRequestId: z.string().optional(),
});

async function assertEditorTrip(req: FastifyRequest, tripId: string | null) {
  const user = req.user;
  if (user.sub !== "editor") return;
  if (!tripId || tripId !== user.tripId) {
    throw Object.assign(new Error("无权编辑此行程账单"), { code: 40301 });
  }
}

export async function budgetRoutes(app: FastifyInstance) {
  app.get("/api/v1/trips/:id/expenses", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await assertEditorTrip(req, id);
      return ok(await budget.listExpenses(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/trips/:id/expenses", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      await assertEditorTrip(req, id);
      return reply.status(201).send(ok(await budget.addExpense(id, parsed.data)));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.patch("/api/v1/expenses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      const tripId = await budget.tripIdForExpense(id);
      await assertEditorTrip(req, tripId);
      return ok(await budget.updateExpense(id, parsed.data));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.delete("/api/v1/expenses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const tripId = await budget.tripIdForExpense(id);
      await assertEditorTrip(req, tripId);
      return ok(await budget.removeExpense(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.put("/api/v1/expenses/:id/receipt", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ dataUrl: z.string().min(32).max(4_000_000) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "图片无效"));
    try {
      const tripId = await budget.tripIdForExpense(id);
      await assertEditorTrip(req, tripId);
      return ok(await budget.saveReceipt(id, parsed.data.dataUrl));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.get("/api/v1/expenses/:id/receipt", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const file = await budget.getReceipt(id);
      await assertEditorTrip(req, file.tripId);
      return reply
        .header("Content-Type", file.mime)
        .header("Cache-Control", "private, max-age=3600")
        .send(file.buf);
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.delete("/api/v1/expenses/:id/receipt", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const tripId = await budget.tripIdForExpense(id);
      await assertEditorTrip(req, tripId);
      return ok(await budget.clearReceipt(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.get("/api/v1/trips/:id/settlement", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await assertEditorTrip(req, id);
      return ok(await budget.settlement(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.get("/api/v1/trips/:id/budget-summary", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await assertEditorTrip(req, id);
      return ok(await budget.summary(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });
}
