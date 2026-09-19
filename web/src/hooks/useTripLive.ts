import { useEffect, useRef, useState } from "react";
import { isErr } from "@/api/client";
import { postLive, type LivePeer } from "@/api/live";

const CLIENT_KEY = "triptrace_live_client";
const INTERVAL_MS = 2500;

function getClientId() {
  let id = sessionStorage.getItem(CLIENT_KEY);
  if (!id || id.length < 8) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

type Opts = {
  tripId: string | undefined;
  sinceVersion: number;
  name?: string;
  token?: string | null;
  enabled?: boolean;
  onRemoteChange?: (editVersion: number) => void;
};

export function useTripLive({
  tripId,
  sinceVersion,
  name,
  token,
  enabled = true,
  onRemoteChange,
}: Opts) {
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [online, setOnline] = useState(false);
  const versionRef = useRef(sinceVersion);
  const onChangeRef = useRef(onRemoteChange);
  versionRef.current = sinceVersion;
  onChangeRef.current = onRemoteChange;

  useEffect(() => {
    if (!tripId || !enabled) {
      setPeers([]);
      setOnline(false);
      return;
    }

    let cancelled = false;
    const clientId = getClientId();

    async function tick() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await postLive(
          tripId!,
          {
            clientId,
            name,
            sinceVersion: versionRef.current,
          },
          token !== undefined ? { token } : undefined,
        );
        if (cancelled) return;
        if (isErr(res)) {
          setOnline(false);
          return;
        }
        setOnline(true);
        setPeers(res.data.peers);
        if (res.data.changed) {
          onChangeRef.current?.(res.data.editVersion);
        }
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tripId, enabled, name, token]);

  const others = peers.filter((p) => p.clientId !== getClientId());

  return { peers, others, online };
}
