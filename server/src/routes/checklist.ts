import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as checklist from "../services/checklist.service.js";

const templateIds = ["general", "flight-ban", "plateau", "beach", "family"] as const;

function sendErr(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  const err = e as Error & { code?: number };
  const code = err.code ?? 40001;
  const http = code === 40003 ? 404 : 400;
  return reply.status(http).send(fail(code, err.message));
}

export async function checklistRoutes(app: FastifyInstance) {
  app.get("/api/v1/checklist/templates", async () => ok(checklist.listTemplates()));

  app.get("/api/v1/trips/:id/checklist", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return ok(await checklist.listItems(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/trips/:id/checklist/from-template", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ templateId: z.enum(templateIds) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await checklist.applyTemplate(id, parsed.data.templateId));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.get("/api/v1/trips/:id/checklist/suggestions", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return ok(await checklist.suggestForTrip(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/trips/:id/checklist/from-suggestions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        items: z
          .array(z.object({ name: z.string().min(1).max(80), category: z.string().max(20).optional() }))
          .min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await checklist.applySuggestions(id, parsed.data.items));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.post("/api/v1/trips/:id/checklist", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ name: z.string().min(1).max(80), category: z.string().max(20).optional() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return reply
        .status(201)
        .send(ok(await checklist.addCustom(id, parsed.data.name, parsed.data.category ?? "其他")));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.patch("/api/v1/checklist-items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        checked: z.boolean().optional(),
        name: z.string().min(1).max(80).optional(),
        category: z.string().max(20).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail(40001, "参数无效"));
    try {
      return ok(await checklist.patchItem(id, parsed.data));
    } catch (e) {
      return sendErr(reply, e);
    }
  });

  app.delete("/api/v1/checklist-items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return ok(await checklist.removeItem(id));
    } catch (e) {
      return sendErr(reply, e);
    }
  });
}
