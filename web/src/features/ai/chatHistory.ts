export type ChatLinkPage = "plan" | "checklist" | "budget" | "nearby" | "review";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  links?: Array<{ label: string; page: ChatLinkPage }>;
  at: number;
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
};

type Store = { threads: ChatThread[]; activeId: string | null };

function key(tripId: string) {
  return `triptrace.ai.chats.v1.${tripId}`;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function read(tripId: string): Store {
  try {
    const raw = localStorage.getItem(key(tripId));
    if (!raw) return { threads: [], activeId: null };
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.threads)) return { threads: [], activeId: null };
    return parsed;
  } catch {
    return { threads: [], activeId: null };
  }
}

function write(tripId: string, store: Store) {
  localStorage.setItem(key(tripId), JSON.stringify(store));
}

export function listThreads(tripId: string): ChatThread[] {
  return read(tripId).threads.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveThread(tripId: string): ChatThread | null {
  const s = read(tripId);
  if (!s.activeId) return s.threads[0] ?? null;
  return s.threads.find((t) => t.id === s.activeId) ?? s.threads[0] ?? null;
}

export function ensureThread(tripId: string): ChatThread {
  const s = read(tripId);
  let t = s.activeId ? s.threads.find((x) => x.id === s.activeId) : null;
  if (!t) {
    t = { id: uid(), title: "新对话", updatedAt: Date.now(), messages: [] };
    s.threads.unshift(t);
    s.activeId = t.id;
    write(tripId, s);
  }
  return t;
}

export function setActiveThread(tripId: string, id: string) {
  const s = read(tripId);
  if (!s.threads.some((t) => t.id === id)) return;
  s.activeId = id;
  write(tripId, s);
}

export function newThread(tripId: string): ChatThread {
  const s = read(tripId);
  const t: ChatThread = { id: uid(), title: "新对话", updatedAt: Date.now(), messages: [] };
  s.threads.unshift(t);
  s.activeId = t.id;
  write(tripId, s);
  return t;
}

export function saveThread(tripId: string, thread: ChatThread) {
  const s = read(tripId);
  const i = s.threads.findIndex((t) => t.id === thread.id);
  if (i >= 0) s.threads[i] = thread;
  else s.threads.unshift(thread);
  s.activeId = thread.id;
  write(tripId, s);
}

export function titleFromMessage(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.slice(0, 24) || "新对话";
}

export function makeMsg(
  role: "user" | "assistant",
  content: string,
  links?: ChatMsg["links"],
): ChatMsg {
  return { id: uid(), role, content, links, at: Date.now() };
}
