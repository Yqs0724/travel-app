import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/response.js";
import * as shareService from "../services/share.service.js";

export async function shareRoutes(app: FastifyInstance) {
  app.post("/api/v1/trips/:id/share", async (req, reply) => {
    const { id } = req.params as { id: string };
    const link = await shareService.createOrGetShare(id);
    if (!link) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok({
      token: link.token,
      path: `/share/${link.token}`,
      expiresAt: link.expiresAt,
    });
  });

  /** 仅共同支出 + 附图 */
  app.post("/api/v1/trips/:id/share/aa", async (req, reply) => {
    const { id } = req.params as { id: string };
    const link = await shareService.createOrGetAaShare(id);
    if (!link) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok({
      token: link.token,
      path: `/share/${link.token}`,
      expiresAt: link.expiresAt,
      sharedCount: link.sharedCount,
    });
  });

  /** 协作：生成/复用可编辑链接（无密码） */
  app.post("/api/v1/trips/:id/share/edit", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const link = await shareService.createOrUpdateEditShare(id);
      if (!link) return reply.status(404).send(fail(40003, "行程不存在"));
      return ok({
        token: link.token,
        path: `/share/${link.token}`,
        expiresAt: link.expiresAt,
      });
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(400).send(fail(err.code ?? 40001, err.message));
    }
  });

  app.get("/api/v1/trips/:id/shares", async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await shareService.listShares(id);
    if (!list) return reply.status(404).send(fail(40003, "行程不存在"));
    return ok(list);
  });

  app.delete("/api/v1/trips/:id/shares/:token", async (req, reply) => {
    const { id, token } = req.params as { id: string; token: string };
    const list = await shareService.revokeShare(id, token);
    if (!list) return reply.status(404).send(fail(40003, "链接不存在"));
    return ok(list);
  });

  app.get("/api/v1/share/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const snap = await shareService.getShareByToken(token);
    if (!snap) return reply.status(404).send(fail(40003, "分享不存在或已过期"));
    return ok(snap);
  });

  /** AA 分享页公开附图（仅共同支出） */
  app.get("/api/v1/share/:token/expenses/:expenseId/receipt", async (req, reply) => {
    const { token, expenseId } = req.params as { token: string; expenseId: string };
    try {
      const file = await shareService.getAaShareReceipt(token, expenseId);
      if (!file) return reply.status(404).send(fail(40003, "附图不存在"));
      return reply
        .header("Content-Type", file.mime)
        .header("Cache-Control", "public, max-age=3600")
        .send(file.buf);
    } catch (e) {
      const err = e as Error & { code?: number };
      const code = err.code ?? 40003;
      return reply.status(code === 40003 ? 404 : 400).send(fail(code, err.message));
    }
  });

  /** 协作链接一点即编辑 JWT（无密码） */
  app.post("/api/v1/share/:token/unlock", async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      const unlocked = await shareService.unlockEditShare(token);
      if (!unlocked) return reply.status(404).send(fail(40003, "分享不存在或不可编辑"));
      const editToken = await reply.jwtSign(
        { sub: "editor", tripId: unlocked.tripId },
        { expiresIn: "12h" },
      );
      return ok({
        token: editToken,
        editVersion: unlocked.editVersion,
        members: unlocked.members,
        trip: unlocked.trip,
      });
    } catch (e) {
      const err = e as Error & { code?: number };
      return reply.status(400).send(fail(err.code ?? 40001, err.message));
    }
  });
}
