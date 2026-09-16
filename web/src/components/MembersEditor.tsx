import { useState } from "react";
import { Button } from "@/components/Button";

/** 同行朋友（不含「我」）；可为 0 人，共同支出时再至少加 1 人 */
export function MembersEditor({
  members,
  onChange,
}: {
  members: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const name = draft.trim();
    if (!name || name === "我" || members.includes(name)) return;
    onChange([...members, name]);
    setDraft("");
  }

  function remove(name: string) {
    onChange(members.filter((m) => m !== name));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">同行人（不含自己，共同支出时勾选）</p>
      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 ? (
          <span className="text-xs text-ink-muted">暂无，需要分摊时再加</span>
        ) : (
          members.map((m) => (
            <span
              key={m}
              className="inline-flex h-8 items-center rounded-full bg-surface-2 pl-3 text-xs text-accent-dark"
            >
              {m}
              <button
                type="button"
                aria-label={`移除 ${m}`}
                className="px-2 text-ink-muted"
                onClick={() => remove(m)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none"
          placeholder="加同行人，如：小明"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={!draft.trim() || draft.trim() === "我"}
        >
          加入
        </Button>
      </div>
    </div>
  );
}
