import { createHash } from "node:crypto";
import {
  heartbeat,
  touchVersion,
  wouldConflict,
  type LivePeer,
} from "./live.service.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(wouldConflict(3, 2), "stale version");
assert(!wouldConflict(3, 3), "fresh version");

const tripId = "live-selfcheck-trip";
const a: LivePeer = { clientId: "aaaaaaaa", name: "主人", role: "owner" };
const b: LivePeer = { clientId: "bbbbbbbb", name: "朋友", role: "editor" };

let peers = heartbeat(tripId, a);
assert(peers.length === 1, "solo hello");

peers = heartbeat(tripId, b);
assert(peers.length === 2, "two peers");
assert(peers.some((p) => p.name === "朋友"), "friend present");

touchVersion(tripId, 4);
peers = heartbeat(tripId, a);
assert(peers.length === 2, "still two after bump");

console.log("live selfcheck ok", createHash("sha256").update("ok").digest("hex").slice(0, 8));
