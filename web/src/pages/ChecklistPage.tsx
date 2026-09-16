import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addChecklistItem,
  applyChecklistSuggestions,
  applyTemplate,
  deleteChecklistItem,
  listChecklist,
  listChecklistSuggestions,
  listTemplates,
  patchChecklistItem,
  type ChecklistItem,
  type ChecklistSuggestion,
  type TemplateMeta,
} from "@/api/checklist";
import { isErr } from "@/api/client";
import { Button } from "@/components/Button";
import { IconCloud, IconPlus } from "@/components/Icons";

export function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [suggestions, setSuggestions] = useState<ChecklistSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [showPacks, setShowPacks] = useState(false);

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
    void listTemplates().then((res) => {
      if (!isErr(res)) setTemplates(res.data);
    });
    void reloadSuggestions(id);
  }, [id]);

  const done = items.filter((i) => i.checked).length;

  async function onTemplate(templateId: string) {
    if (!id) return;
    setBusy(true);
    await apply(await applyTemplate(id, templateId));
    await reloadSuggestions(id);
    setBusy(false);
  }

  async function onToggle(it: ChecklistItem) {
    await apply(await patchChecklistItem(it.id, { checked: !it.checked }));
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
    <div className="px-4 pt-4 pb-6">
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
        <div className="mt-4 rounded-card border border-line bg-surface px-3 py-3 shadow-warm">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-accent-dark">
              <IconCloud size={16} />
              根据行程 / 天气建议
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAddAll()}
              className="text-xs text-accent-dark underline"
            >
              全部加入
            </button>
          </div>
          <ul className="mt-2 space-y-2">
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
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          已勾 {done} / {items.length}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 rounded-card border border-line bg-surface px-2 shadow-warm">
            <button
              type="button"
              aria-label={it.checked ? "取消勾选" : "勾选"}
              onClick={() => void onToggle(it)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-[6px] border text-sm ${
                  it.checked ? "border-ok bg-ok text-white" : "border-line bg-surface-2"
                }`}
              >
                {it.checked ? "✓" : ""}
              </span>
            </button>
            <span
              className={`min-w-0 flex-1 text-[15px] ${it.checked ? "text-ink-muted line-through" : ""}`}
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
        ))}
      </ul>

      <div className="mt-6">
        <button
          type="button"
          className="text-xs text-ink-muted"
          onClick={() => setShowPacks((v) => !v)}
        >
          {showPacks ? "收起常用套装" : "从常用套装追加（可选）"}
        </button>
        {showPacks && (
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => void onTemplate(t.id)}
                className="h-8 rounded-full border border-line bg-surface px-3 text-xs text-accent-dark"
              >
                + {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
