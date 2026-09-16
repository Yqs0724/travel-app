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
}
