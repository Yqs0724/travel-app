/** 单机进程内行程协同：在场心跳 + 版本号广播。ponytail: 多实例需换 Redis pub/sub */

export type LivePeer = {
  clientId: string;
  name: string;
  role: "owner" | "editor";
};

type PeerRow = LivePeer & { lastSeen: number };

type Room = {
  peers: Map<string, PeerRow>;
  editVersion: number;
};

const TTL_MS = 10_000;
const rooms = new Map<string, Room>();

function room(tripId: string): Room {
  let r = rooms.get(tripId);
  if (!r) {
    r = { peers: new Map(), editVersion: 0 };
    rooms.set(tripId, r);
  }
  return r;
}

function prune(r: Room, now = Date.now()) {
  for (const [id, p] of r.peers) {
    if (now - p.lastSeen > TTL_MS) r.peers.delete(id);
  }
  if (r.peers.size === 0 && r.editVersion === 0) {
    /* keep room if version known; only drop empty unused later */
  }
}

export function touchVersion(tripId: string, editVersion: number) {
  const r = room(tripId);
  r.editVersion = editVersion;
}

export function heartbeat(tripId: string, peer: LivePeer): LivePeer[] {
  const r = room(tripId);
  const now = Date.now();
  prune(r, now);
  r.peers.set(peer.clientId, { ...peer, lastSeen: now });
  return [...r.peers.values()].map(({ clientId, name, role }) => ({
    clientId,
    name,
    role,
  }));
}

export function currentVersion(tripId: string) {
  return room(tripId).editVersion;
}

/** 纯函数供 selfcheck：期望版本不符即冲突 */
export function wouldConflict(current: number, expected: number) {
  return current !== expected;
}
