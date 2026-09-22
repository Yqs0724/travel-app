import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  applyAdjust,
  chatTrip,
  proposeAdjust,
  type AdjustOp,
  type ChatLinkPage,
} from "@/api/ai";
import { isErr } from "@/api/client";
import type { TripDay, WriteOpts } from "@/api/planner";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { AiPlannerPanel } from "./AiPlannerPanel";
import {
  ensureThread,
  getActiveThread,
  listThreads,
  makeMsg,
  newThread,
  saveThread,
  setActiveThread,
  titleFromMessage,
  type ChatMsg,
  type ChatThread,
} from "./chatHistory";

function looksLikeAdjust(s: string) {
  return /(?:改到|调到|移到|放到|挪到)\s*第?\s*\d+\s*天|(?:改到|调到)\s*D\s*\d+|删除|去掉|移除|删掉|(?:改到|设为|时间为)\s*\d{1,2}\s*[:：点]/.test(
    s,
  );
}

export function AiChatPanel({
  tripId,
  days,
  onCommitted,
  onDayChange,
  writeOpts,
}: {
  tripId: string;
  days: TripDay[];
  onCommitted: (trip: TripDetail) => void;
  onDayChange?: (day: TripDay) => void;
  writeOpts?: WriteOpts;
}) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [adjPreview, setAdjPreview] = useState<{
    summary: string;
    ops: AdjustOp[];
    source: "llm" | "rules";
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function refreshList(active?: ChatThread) {
    setThreads(listThreads(tripId));
    if (active) setThread(active);
    else setThread(getActiveThread(tripId) ?? ensureThread(tripId));
  }

  useEffect(() => {
    refreshList(ensureThread(tripId));
  }, [tripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, busy]);

  const messages = thread?.messages ?? [];
  const empty = messages.length === 0;

  function persist(next: ChatThread) {
    saveThread(tripId, next);
    refreshList(next);
  }

  function onNewChat() {
    const t = newThread(tripId);
    setAdjPreview(null);
    setError(null);
    setHistOpen(false);
    refreshList(t);
    inputRef.current?.focus();
  }

  function onPickThread(id: string) {
    setActiveThread(tripId, id);
    setAdjPreview(null);
    setHistOpen(false);
    refreshList();
  }

  function goPage(page: ChatLinkPage) {
    navigate(`/trips/${tripId}/${page}`);
  }

  async function runAdjust(instruction: string, base: ChatThread) {
    const res = await proposeAdjust(tripId, instruction);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    if (!res.data.ops.length) {
      const failMsg = makeMsg("assistant", res.data.summary || "没识别到可执行的调整");
      persist({ ...base, messages: [...base.messages, failMsg], updatedAt: Date.now() });
      return;
    }
    setAdjPreview(res.data);
    const tip = makeMsg(
      "assistant",
      `${res.data.summary || "已生成调整方案"}（来源：${res.data.source === "llm" ? "模型" : "规则"}）。确认后写入行程。`,
      [{ label: "去行程", page: "plan" }],
    );
    persist({ ...base, messages: [...base.messages, tip], updatedAt: Date.now() });
  }

  async function onApplyAdjust() {
    if (!adjPreview?.ops.length || !thread) return;
    setBusy(true);
    const res = await applyAdjust(tripId, adjPreview.ops);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    onCommitted(res.data);
    const okMsg = makeMsg("assistant", "已应用到行程。", [{ label: "去行程", page: "plan" }]);
    persist({
      ...thread,
      messages: [...thread.messages, okMsg],
      updatedAt: Date.now(),
    });
    setAdjPreview(null);
  }

  async function onSend() {
    const q = text.trim();
    if (!q || !thread || busy) return;
    setError(null);
    setAdjPreview(null);
    setText("");

    const userMsg = makeMsg("user", q);
    let next: ChatThread = {
      ...thread,
      title: thread.messages.length === 0 ? titleFromMessage(q) : thread.title,
      messages: [...thread.messages, userMsg],
      updatedAt: Date.now(),
    };
    persist(next);
    setBusy(true);

    try {
      if (looksLikeAdjust(q)) {
        await runAdjust(q, next);
        return;
      }

      const hist = next.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await chatTrip(tripId, q, hist);
      if (isErr(res)) {
        setError(res.message);
        const failMsg = makeMsg("assistant", res.message);
        persist({ ...next, messages: [...next.messages, failMsg], updatedAt: Date.now() });
        return;
      }

      if (res.data.handoff === "adjust") {
        await runAdjust(q, next);
        return;
      }

      const asst = makeMsg("assistant", res.data.reply, res.data.links);
      next = { ...next, messages: [...next.messages, asst], updatedAt: Date.now() };
      persist(next);

      if (res.data.handoff === "extract") {
        setAssistantOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const historyList = useMemo(
    () => (
      <ul className="space-y-0.5">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`w-full truncate rounded-btn px-3 py-2 text-left text-sm ${
                t.id === thread?.id ? "bg-accent/25 text-accent-dark" : "text-ink hover:bg-surface-2"
              }`}
              onClick={() => onPickThread(t.id)}
            >
              {t.title}
            </button>
          </li>
        ))}
        {threads.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-muted">还没有历史对话</li>
        )}
      </ul>
    ),
    [threads, thread?.id],
  );

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[28rem] flex-col lg:h-[calc(100dvh-4.5rem)] lg:flex-row lg:gap-0">
      {/* 桌面：左侧历史 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-bg lg:flex">
        <div className="p-3">
          <Button type="button" className="w-full" onClick={onNewChat}>
            + 新对话
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scroll-warm">{historyList}</div>
      </aside>

      {/* 主栏 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 手机顶栏 */}
        <div className="flex h-11 items-center justify-between border-b border-line px-3 lg:hidden">
          <button
            type="button"
            className="h-11 px-1 text-sm text-accent-dark"
            onClick={() => setHistOpen(true)}
            aria-label="历史对话"
          >
            历史
          </button>
          <span className="text-sm font-medium text-ink">行程助手</span>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg text-accent-dark"
            onClick={onNewChat}
            aria-label="新对话"
          >
            +
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scroll-warm">
          {empty && (
            <div className="mx-auto flex max-w-lg flex-col items-center pt-[12vh] text-center">
              <p className="text-lg font-medium text-ink">你好，要一起做攻略吗？</p>
              <p className="mt-2 text-sm text-ink-muted">
                可问本行程与清单，例如「清单里有没有酒精」。贴笔记抽地点用下方芯片。
              </p>
            </div>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} onLink={goPage} />
            ))}
            {busy && (
              <p className="text-sm text-ink-muted">{adjPreview ? "生成调整…" : "思考中…"}</p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="px-4 pb-1 text-sm text-danger">{error}</p>}

        {adjPreview && (
          <div className="mx-4 mb-2 rounded-btn border border-line bg-surface-2/80 p-3">
            <p className="text-sm text-ink">{adjPreview.summary}</p>
            <p className="mt-1 text-xs text-ink-muted">{adjPreview.ops.length} 步操作待确认</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" disabled={busy} onClick={() => void onApplyAdjust()}>
                应用到行程
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setAdjPreview(null)}>
                取消
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-line bg-bg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:px-4">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip onClick={() => setAssistantOpen(true)}>行程助手 · 贴笔记</Chip>
              <Chip
                onClick={() => {
                  setText("把第1天最后一站改到第2天");
                  inputRef.current?.focus();
                }}
              >
                微调示例
              </Chip>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-surface-2/60 p-2 shadow-[0_1px_0_rgba(111,88,76,0.06)]">
              <textarea
                ref={inputRef}
                rows={2}
                className="max-h-32 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-ink-muted"
                placeholder="问行程、清单，或说「把熊猫基地改到第2天」"
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2 px-1 pb-0.5">
                <Button type="button" disabled={busy || !text.trim()} onClick={() => void onSend()}>
                  发送
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-ink-muted">联网搜索稍后做 · 当前只依据本行程数据</p>
          </div>
        </div>
      </div>

      {histOpen && (
        <Sheet open onClose={() => setHistOpen(false)} aria-label="历史对话">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium">历史对话</p>
            <button type="button" className="text-sm text-accent-dark" onClick={onNewChat}>
              新对话
            </button>
          </div>
          {historyList}
        </Sheet>
      )}

      {assistantOpen && (
        <Sheet open onClose={() => setAssistantOpen(false)} aria-label="行程助手">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">行程助手</p>
            <button
              type="button"
              className="h-11 w-11 text-lg text-ink-muted"
              onClick={() => setAssistantOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <AiPlannerPanel
            tripId={tripId}
            days={days}
            writeOpts={writeOpts}
            onCommitted={(t) => {
              onCommitted(t);
              setAssistantOpen(false);
            }}
            onDayChange={onDayChange}
          />
        </Sheet>
      )}
    </div>
  );
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-accent-dark"
    >
      {children}
    </button>
  );
}

function Bubble({
  msg,
  onLink,
}: {
  msg: ChatMsg;
  onLink: (page: ChatLinkPage) => void;
}) {
  const mine = msg.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          mine ? "bg-accent-dark text-[#FAF7F2]" : "bg-surface-2 text-ink"
        }`}
      >
        {msg.content}
        {!!msg.links?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.links.map((l) => (
              <button
                key={l.page + l.label}
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${
                  mine ? "bg-[#FAF7F2]/15 text-[#FAF7F2]" : "bg-bg text-accent-dark border border-line"
                }`}
                onClick={() => onLink(l.page)}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
