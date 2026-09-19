import { api, type ApiOpts } from "./client";

export type LivePeer = {
  clientId: string;
  name: string;
  role: "owner" | "editor";
};

export type LiveSnap = {
  editVersion: number;
  changed: boolean;
  peers: LivePeer[];
};

export function postLive(
  tripId: string,
  body: { clientId: string; name?: string; sinceVersion?: number },
  opts?: ApiOpts,
) {
  return api<LiveSnap>(
    `/api/v1/trips/${tripId}/live`,
    { method: "POST", body: JSON.stringify(body) },
    opts,
  );
}
