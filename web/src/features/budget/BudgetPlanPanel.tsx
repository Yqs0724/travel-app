import { FormEvent, useEffect, useState } from "react";
import {
  addBudgetPlan,
  deleteBudgetPlan,
  implantBudgetPlan,
  listBudgetPlans,
  planMyAmount,
  updateBudgetPlan,
  yuan,
  type BudgetPlanItem,
} from "@/api/budget";
import { isErr, type ApiOpts } from "@/api/client";
import { Button } from "@/components/Button";
import { IconPlus } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";

function totalMine(items: BudgetPlanItem[]) {
  return Math.round(items.reduce((s, i) => s + planMyAmount(i), 0) * 100) / 100;
}

function totalBill(items: BudgetPlanItem[]) {
  return Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
}

function toggleFriend(list: string[], m: string) {
  return list.includes(m) ? list.filter((x) => x !== m) : [...list, m];
}

export function BudgetPlanPanel({
  tripId,
  members = [],
  apiOpts,
  onImplanted,
}: {
  tripId: string;
  members?: string[];
  apiOpts?: ApiOpts;
  onImplanted?: () => void;
}) {
  const friends = members;
  const [items, setItems] = useState<BudgetPlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<BudgetPlanItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [friendOn, setFriendOn] = useState<string[]>([]);

  async function apply(res: Awaited<ReturnType<typeof listBudgetPlans>>) {
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setError(null);
    setItems(res.data);
  }

  useEffect(() => {
    void listBudgetPlans(tripId, apiOpts).then(apply);
  }, [tripId, apiOpts?.token]);

  useEffect(() => {
    setFriendOn((prev) => prev.filter((m) => friends.includes(m)));
  }, [friends.join("|")]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!name.trim()) {
      setError("请填写花费项目");
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError("预计花费无效");
      return;
    }
    setBusy(true);
    await apply(await addBudgetPlan(tripId, { name: name.trim(), amount: n }, apiOpts));
    setBusy(false);
    setName("");
    setAmount("");
  }

  async function onDelete(it: BudgetPlanItem) {
    if (it.implanted) return;
    await apply(await deleteBudgetPlan(it.id, apiOpts));
  }

  function openEdit(it: BudgetPlanItem) {
    if (it.implanted) return;
    setEditing(it);
    setEditName(it.name);
    setEditAmount(String(it.amount));
    setFriendOn([]);
    setError(null);
  }

  function closeEdit() {
    setEditing(null);
    setFriendOn([]);
  }

  function parseEdit(): { name: string; amount: number } | null {
    const title = editName.trim();
    const n = Number(editAmount);
    if (!title) {
      setError("请填写花费项目");
      return null;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError("预计花费无效");
      return null;
    }
    return { name: title, amount: n };
  }

  /** 若表单相对原值有改动，先 PATCH 再继续 */
  async function saveEditsIfNeeded(it: BudgetPlanItem) {
    const parsed = parseEdit();
    if (!parsed) return null;
    if (parsed.name === it.name && parsed.amount === it.amount) return it;
    const res = await updateBudgetPlan(it.id, parsed, apiOpts);
    if (isErr(res)) {
      setError(res.message);
      return null;
    }
    setItems(res.data);
    return res.data.find((x) => x.id === it.id) ?? { ...it, ...parsed };
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const saved = await saveEditsIfNeeded(editing);
    setBusy(false);
    if (!saved) return;
    closeEdit();
  }

  async function onConfirmImplant() {
    if (!editing) return;
    setBusy(true);
    const saved = await saveEditsIfNeeded(editing);
    if (!saved) {
      setBusy(false);
      return;
    }
    const res = await implantBudgetPlan(saved.id, friendOn, apiOpts);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setItems(res.data);
    closeEdit();
    onImplanted?.();
  }

  const open = items.filter((i) => !i.implanted);
  const done = items.filter((i) => i.implanted);
  /** 预计总额按「我付」：已入账共同只算我的份 */
  const total = totalMine(items);
  const openTotal = totalBill(open);
  const editBill = Number(editAmount);
  const previewMine =
    friendOn.length > 0 && Number.isFinite(editBill) && editBill > 0
      ? Math.round((editBill / (1 + friendOn.length)) * 100) / 100
      : null;

  return (
    <div>
      <p className="text-[20px] font-semibold tabular-nums">{yuan(total)}</p>
      <p className="mt-1 text-xs text-ink-muted">
        预计花费总额
        {items.length > 0 ? (
          <>
            {" · "}未入账{" "}
            <span className="font-medium tabular-nums text-ink">{yuan(openTotal)}</span>
          </>
        ) : null}
      </p>

      <form onSubmit={(e) => void onAdd(e)} className="mt-4 flex gap-2">
        <input
          className="h-11 min-w-0 flex-[1.4] rounded-full bg-surface-2 px-3 text-sm outline-none placeholder:text-ink-muted"
          placeholder="花费项目"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="h-11 w-[5.5rem] shrink-0 rounded-full bg-surface-2 px-3 text-sm tabular-nums outline-none placeholder:text-ink-muted"
          placeholder="金额"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          type="submit"
          className="h-11 shrink-0 gap-1 px-3"
          disabled={busy || !name.trim() || !amount}
        >
          <IconPlus size={16} className="text-white" />
          添加
        </Button>
      </form>

      {error && !editing && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-4 space-y-2">
        {items.length === 0 ? (
          <li className="rounded-card border border-line bg-surface px-3 py-6 text-center text-sm text-ink-muted shadow-warm">
            先录入项目和预计花费
          </li>
        ) : (
          <>
            {open.map((it) => (
              <li
                key={it.id}
                className="rounded-card border border-line bg-surface px-3 py-2 shadow-warm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-0.5 self-stretch rounded-full bg-accent-dark/40" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openEdit(it)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-medium">{it.name}</span>
                      <span className="shrink-0 tabular-nums text-[15px] font-semibold">
                        {yuan(it.amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">点按编辑 · 可记入实付</p>
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-ink-muted"
                    onClick={() => void onDelete(it)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}

            {done.length > 0 && (
              <>
                <li className="pt-3" aria-hidden>
                  <div className="flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />
                    <span className="shrink-0 text-[11px] text-ink-muted">已入账</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </li>
                {done.map((it) => {
                  const shared = it.friendCount > 0;
                  const mine = planMyAmount(it);
                  return (
                    <li
                      key={it.id}
                      className="rounded-card border border-line/70 bg-surface-2/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 opacity-70">
                        <span className="w-0.5 self-stretch rounded-full bg-accent-dark/20" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="min-w-0 truncate text-[15px] text-ink-muted line-through decoration-accent-dark/35">
                              {it.name}
                              {shared && (
                                <span className="ml-1.5 text-[11px] no-underline">共同</span>
                              )}
                            </span>
                            <span className="shrink-0 tabular-nums text-[15px] text-ink-muted line-through decoration-accent-dark/35">
                              {yuan(mine)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {shared
                              ? `共同 · 我付 ${yuan(mine)} · 账单 ${yuan(it.amount)}`
                              : "已记入实付"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </>
            )}
          </>
        )}
      </ul>

      <Sheet open={!!editing} onClose={closeEdit} aria-label="编辑预算">
        {editing && (
          <form onSubmit={(e) => void onSaveEdit(e)} className="space-y-3">
            <p className="text-sm font-medium">编辑预算</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <input
              className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
              placeholder="花费项目"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm tabular-nums outline-none"
              placeholder="预计花费"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              required
            />
            {friends.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-ink-muted">记入实付时：勾选共同分摊朋友</p>
                <div className="flex flex-wrap gap-1.5">
                  {friends.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFriendOn((prev) => toggleFriend(prev, m))}
                      className={`h-8 rounded-full px-3 text-xs ${
                        friendOn.includes(m)
                          ? "bg-accent text-accent-dark"
                          : "bg-surface-2 text-accent-dark"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {previewMine != null && (
                  <p className="mt-1.5 text-[11px] text-ink-muted">
                    与 {friendOn.join("、")} 分摊 · 我付 {yuan(previewMine)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">记入实付将为个人支出（设置里可加同行人）</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>
                保存
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy}
                onClick={() => void onConfirmImplant()}
              >
                记入实付
              </Button>
              <Button type="button" variant="secondary" onClick={closeEdit}>
                取消
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
