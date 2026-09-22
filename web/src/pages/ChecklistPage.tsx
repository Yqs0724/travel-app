import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addChecklistItem,
  applyChecklistSuggestions,
  deleteChecklistItem,
  listChecklist,
  listChecklistSuggestions,
  patchChecklistItem,
  type ChecklistItem,
  type ChecklistSuggestion,
} from "@/api/checklist";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";
import { IconCloud, IconPlus } from "@/components/Icons";

type Mode = "buy" | "pack";

export function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [suggestions, setSuggestions] = useState<ChecklistSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("buy");
  /** 建议默认收起，避免占满手机屏 */
  const [showSuggestions, setShowSuggestions] = useState(false);

  async function apply(res: Awaited<ReturnType<typeof listChecklist>>) {
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setError(null);
    setItems(res.data);
  }

  async function reloadSuggestions(tripId: string) {
    const res = await listChecklistSuggestions(tripId);
    if (!isErr(res)) setSuggestions(res.data);
  }

  useEffect(() => {
    if (!id) return;
    void listChecklist(id).then(apply);
    void reloadSuggestions(id);
  }, [id]);

  const doneInMode = items.filter((i) => (mode === "buy" ? i.purchased : i.checked)).length;

  async function onToggle(it: ChecklistItem) {
    if (mode === "buy") {
      await apply(await patchChecklistItem(it.id, { purchased: !it.purchased }));
    } else {
      await apply(await patchChecklistItem(it.id, { checked: !it.checked }));
    }
  }

  async function onDelete(it: ChecklistItem) {
    if (!id) return;
    await apply(await deleteChecklistItem(it.id));
    await reloadSuggestions(id);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!id || !name.trim()) return;
    setBusy(true);
    await apply(await addChecklistItem(id, name.trim()));
    await reloadSuggestions(id);
    setBusy(false);
    setName("");
  }

  async function onAddOne(s: ChecklistSuggestion) {
    if (!id) return;
    setBusy(true);
    await apply(await applyChecklistSuggestions(id, [{ name: s.name, category: s.category }]));
    await reloadSuggestions(id);
    setBusy(false);
  }

  async function onAddAll() {
    if (!id || suggestions.length === 0) return;
    setBusy(true);
    await apply(
      await applyChecklistSuggestions(
        id,
        suggestions.map((s) => ({ name: s.name, category: s.category })),
      ),
    );
    await reloadSuggestions(id);
    setBusy(false);
  }

  if (!id) return null;

  return (
    <div className="px-4 pt-4 pb-6 desk-read">
      <form onSubmit={(e) => void onAdd(e)} className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none placeholder:text-ink-muted"
          placeholder="回车添加"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" className="gap-1.5" disabled={busy || !name.trim()}>
          <IconPlus size={16} className="text-white" />
          添加
        </Button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-4 rounded-card border border-line bg-surface px-3 py-2 shadow-warm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm font-medium text-accent-dark"
              onClick={() => setShowSuggestions((v) => !v)}
              aria-expanded={showSuggestions}
            >
              <IconCloud size={16} className="shrink-0" />
              <span className="min-w-0 truncate">根据行程 / 天气建议</span>
              <span className="shrink-0 text-xs font-normal text-ink-muted">
                {suggestions.length} 条 · {showSuggestions ? "收起" : "展开"}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAddAll()}
              className="shrink-0 py-1 text-xs text-accent-dark underline"
            >
              全部加入
            </button>
          </div>
          {showSuggestions ? (
            <ul className="mt-2 space-y-2 border-t border-line pt-2">
              {suggestions.map((s) => (
                <li key={`${s.reason}-${s.name}`} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{s.name}</p>
                    <p className="text-[11px] text-ink-muted">{s.reason}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAddOne(s)}
                    className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-accent-dark"
                  >
                    加入
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-warm">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <p className="text-sm text-ink-muted">
            {items.length > 0 ? `完成 ${doneInMode} / ${items.length}` : "还没有物品"}
          </p>
          <div
            className="relative flex h-7 w-[5.5rem] shrink-0 rounded-full bg-surface-2 p-0.5"
            role="tablist"
            aria-label="清单模式"
          >
            <span
              className="pointer-events-none absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out"
              style={{ transform: mode === "pack" ? "translateX(100%)" : "translateX(0)" }}
              aria-hidden
            />
            <button
              type="button"
              role="tab"
              aria-selected={mode === "buy"}
              className={`relative z-10 flex-1 text-[11px] ${
                mode === "buy" ? "font-medium text-accent-dark" : "text-ink-muted"
              }`}
              onClick={() => setMode("buy")}
            >
              采购
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "pack"}
              className={`relative z-10 flex-1 text-[11px] ${
                mode === "pack" ? "font-medium text-accent-dark" : "text-ink-muted"
              }`}
              onClick={() => setMode("pack")}
            >
              打包
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-muted">先在上方添加，或展开建议加入</p>
        ) : (
          <ul>
            {items.map((it, i) => {
              const on = mode === "buy" ? it.purchased : it.checked;
              return (
                <li
                  key={it.id}
                  className={`flex items-center gap-2 px-2 ${
                    i > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <button
                    type="button"
                    aria-label={
                      mode === "buy"
                        ? on
                          ? "取消已购买"
                          : "标记已购买"
                        : on
                          ? "取消已携带"
                          : "标记已携带"
                    }
                    onClick={() => void onToggle(it)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-[6px] border text-sm ${
                        on ? "border-ok bg-ok text-white" : "border-line bg-surface-2"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-[15px] ${
                      on ? "text-ink-muted line-through" : ""
                    }`}
                  >
                    {it.name}
                    {it.source === "suggest" && (
                      <span className="ml-1 text-[11px] font-normal text-ink-muted">建议</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label="删除"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none text-ink-muted"
                    onClick={() => void onDelete(it)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
