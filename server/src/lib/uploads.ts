import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPLOAD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/uploads");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 上限约 2MB 解码后 */
const MAX_BYTES = 2 * 1024 * 1024;

export function parseDataUrl(dataUrl: string): { ext: string; buf: Buffer } {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) {
    throw Object.assign(new Error("仅支持 jpg/png/webp 图片"), { code: 40001 });
  }
  const mime = m[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw Object.assign(new Error("仅支持 jpg/png/webp 图片"), { code: 40001 });
  }
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    throw Object.assign(new Error("图片需小于 2MB"), { code: 40001 });
  }
  return { ext, buf };
}

function receiptPath(expenseId: string, ext: string) {
  return join(UPLOAD_ROOT, "receipts", `${expenseId}.${ext}`);
}

export async function saveReceiptFile(expenseId: string, dataUrl: string) {
  const { ext, buf } = parseDataUrl(dataUrl);
  const path = receiptPath(expenseId, ext);
  await mkdir(dirname(path), { recursive: true });
  // 换扩展名时清掉旧文件
  for (const e of Object.keys(EXT_MIME)) {
    if (e === ext) continue;
    await unlink(receiptPath(expenseId, e)).catch(() => undefined);
  }
  await writeFile(path, buf);
  return ext;
}

export async function readReceiptFile(expenseId: string, ext: string) {
  const buf = await readFile(receiptPath(expenseId, ext));
  return { buf, mime: EXT_MIME[ext] ?? "application/octet-stream" };
}

export async function deleteReceiptFile(expenseId: string, ext: string | null | undefined) {
  if (!ext) return;
  await unlink(receiptPath(expenseId, ext)).catch(() => undefined);
}
