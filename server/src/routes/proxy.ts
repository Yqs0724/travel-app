import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as amap from "../providers/amap.js";

export async function proxyRoutes(app: FastifyInstance) {
  app.get("/api/v1/proxy/amap/poi", async (req, reply) => {
    const q = z
      .object({
        keyword: z.string().min(1),
        city: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success) return reply.status(400).send(fail(40001, "缺少 keyword"));
    try {
      const hits = await amap.searchPoi(q.data.keyword, q.data.city);
      return ok(hits);
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(502).send(fail(err.code ?? 50201, err.message));
    }
  });

  app.get("/api/v1/proxy/amap/route", async (req, reply) => {
    const q = z
      .object({
        from: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
        to: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
        mode: z.enum(["walk", "transit", "drive", "bike"]),
      })
      .safeParse(req.query);
    if (!q.success) return reply.status(400).send(fail(40001, "参数无效"));
    const [flng, flat] = q.data.from.split(",").map(Number) as [number, number];
    const [tlng, tlat] = q.data.to.split(",").map(Number) as [number, number];
    try {
      const route = await amap.routeBetween(
        { lng: flng, lat: flat },
        { lng: tlng, lat: tlat },
        q.data.mode,
      );
      return ok(route);
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(502).send(fail(err.code ?? 50201, err.message));
    }
  });

  app.get("/api/v1/proxy/amap/around", async (req, reply) => {
    const q = z
      .object({
        lng: z.coerce.number().finite(),
        lat: z.coerce.number().finite(),
        types: z.string().optional(),
        keywords: z.string().optional(),
        radius: z.coerce.number().int().positive().max(50000).optional(),
      })
      .safeParse(req.query);
    if (!q.success) return reply.status(400).send(fail(40001, "参数无效"));
    const types = q.data.types?.trim() || undefined;
    const keywords = q.data.keywords?.trim() || undefined;
    if (!types && !keywords) {
      return reply.status(400).send(fail(40001, "types 与 keywords 不能都为空"));
    }
    try {
      const hits = await amap.searchAround({
        lng: q.data.lng,
        lat: q.data.lat,
        types,
        keywords,
        radius: q.data.radius,
      });
      return ok(hits);
    } catch (e) {
      const err = e as Error & { code?: number };
      const code = err.code ?? 50201;
      return reply.status(code === 40001 ? 400 : 502).send(fail(code, err.message));
    }
  });
}
