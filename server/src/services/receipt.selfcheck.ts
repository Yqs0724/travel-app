import { parseDataUrl } from "../lib/uploads.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const { ext, buf } = parseDataUrl(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
);
assert(ext === "png", "ext png");
assert(buf.length > 0, "buf");

let threw = false;
try {
  parseDataUrl("data:text/plain;base64,YQ==");
} catch {
  threw = true;
}
assert(threw, "reject non-image");

threw = false;
try {
  parseDataUrl("data:image/png;base64,");
} catch {
  threw = true;
}
assert(threw, "reject empty");

console.log("receipt selfcheck ok");
