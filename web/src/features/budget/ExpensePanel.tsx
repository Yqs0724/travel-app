import { FormEvent, useEffect, useState } from "react";
import {
  addExpense,
  deleteExpense,
  getBudgetSummary,
  getSettlement,
  listExpenses,
  updateExpense,
  yuan,
  type BudgetSummary,
  type Expense,
  type Transfer,
} from "@/api/budget";
import { isErr, type ApiOpts } from "@/api/client";
import { Button } from "@/components/Button";
import { IconPlus } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { BudgetPlanPanel } from "./BudgetPlanPanel";

type TabMode = "spend" | "plan";

function isSharedExpense(exp: Expense, me: string) {
  return exp.splits.some((s) => s.member !== me);
}

export function ExpensePanel({
  tripId,
  members,
  apiOpts,
}: {
  tripId: string;
  members: string[];
  /** @deprecated 记账页不再改同行人；保留以免旧调用报错 */
  onMembersChange?: (members: string[]) => void;
  allowAddMember?: boolean;
  apiOpts?: ApiOpts;
}) {
  const me = "我";
  const friends = members;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [sum, setSum] = useState<BudgetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<TabMode>("spend");

  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [friendOn, setFriendOn] = useState<string[]>([]);

  const [editing, setEditing] = useState<Expense | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editFriendOn, setEditFriendOn] = useState<string[]>([]);

  async function refresh() {
    const [e, s, t] = await Promise.all([
      listExpenses(tripId, apiOpts),
      getBudgetSummary(tripId, apiOpts),
      getSettlement(tripId, apiOpts),
    ]);
    if (isErr(e)) {
      setError(e.message);
      return;
    }
    setError(null);
    setExpenses(e.data);
    if (!isErr(s)) setSum(s.data);
    if (!isErr(t)) setTransfers(t.data);
  }

  useEffect(() => {
    void refresh();
  }, [tripId, apiOpts?.token]);

  useEffect(() => {
    setFriendOn((prev) => prev.filter((m) => friends.includes(m)));
    setEditFriendOn((prev) => prev.filter((m) => friends.includes(m)));
  }, [friends.join("|")]);

  function splitsFrom(selected: string[]) {
    if (selected.length === 0) return [{ member: me, ratio: 1 }];
    return [{ member: me, ratio: 1 }, ...selected.map((m) => ({ member: m, ratio: 1 }))];
  }

  function toggleFriend(list: string[], m: string) {
    return list.includes(m) ? list.filter((x) => x !== m) : [...list, m];
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    const shop = note.trim();
    if (!shop) {
      setError("请填写花费项目");
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError("金额无效");
      return;
    }
    setBusy(true);
    const res = await addExpense(
      tripId,
      {
        category: "other",
        amount: n,
        note: shop,
        payer: me,
        splits: splitsFrom(friendOn),
      },
      apiOpts,
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setNote("");
    setAmount("");
    setFriendOn([]);
    setExpenses(res.data);
    void refresh();
  }

  function openEdit(exp: Expense) {
    setEditing(exp);
    setEditNote(exp.note ?? "");
    setEditAmount(String(exp.amount));
    setEditFriendOn(
      exp.splits.map((s) => s.member).filter((m) => m !== me && friends.includes(m)),
    );
    setError(null);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const n = Number(editAmount);
    const shop = editNote.trim();
    if (!shop) {
      setError("请填写花费项目");
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError("金额无效");
      return;
    }
    setBusy(true);
    const res = await updateExpense(
      editing.id,
      {
        amount: n,
        note: shop,
        payer: me,
        splits: splitsFrom(editFriendOn),
      },
      apiOpts,
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setEditing(null);
    setExpenses(res.data);
    void refresh();
  }

  async function onDelete(exp: Expense) {
    const res = await deleteExpense(exp.id, apiOpts);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setExpenses(res.data);
    void refresh();
  }

  const othersOwe = sum?.othersOweMe ?? 0;

  return (
    <div className="px-4 pt-4 pb-8 desk-read">
      <div className="mb-4 flex justify-end">
        <div
          className="relative flex h-7 w-[5.5rem] shrink-0 rounded-full bg-surface-2 p-0.5"
          role="tablist"
          aria-label="记账模式"
        >
          <span
            className="pointer-events-none absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: mode === "plan" ? "translateX(100%)" : "translateX(0)" }}
            aria-hidden
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "spend"}
            className={`relative z-10 flex-1 text-[11px] ${
              mode === "spend" ? "font-medium text-accent-dark" : "text-ink-muted"
            }`}
            onClick={() => setMode("spend")}
          >
            实付
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "plan"}
            className={`relative z-10 flex-1 text-[11px] ${
              mode === "plan" ? "font-medium text-accent-dark" : "text-ink-muted"
            }`}
            onClick={() => setMode("plan")}
          >
            预算
          </button>
        </div>
      </div>

      {mode === "plan" ? (
        <BudgetPlanPanel
          tripId={tripId}
          members={friends}
          apiOpts={apiOpts}
          onImplanted={() => void refresh()}
        />
      ) : (
        <div>
          <p className="text-[20px] font-semibold tabular-nums">{yuan(sum?.total ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            我已支出
            {othersOwe > 0 ? (
              <>
                {" · "}朋友应付我{" "}
                <span className="font-medium tabular-nums text-ink">{yuan(othersOwe)}</span>
              </>
            ) : null}
          </p>

          <form onSubmit={(e) => void onAdd(e)} className="mt-4 space-y-2">
            <div className="flex gap-2">
              <input
                className="h-11 min-w-0 flex-[1.4] rounded-full bg-surface-2 px-3 text-sm outline-none placeholder:text-ink-muted"
                placeholder="花费项目"
                value={note}
                onChange={(e) => setNote(e.target.value)}
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
                disabled={busy || !note.trim() || !amount}
              >
                <IconPlus size={16} className="text-white" />
                添加
              </Button>
            </div>
            {friends.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-ink-muted">共同分摊（勾选朋友）</p>
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
              </div>
            ) : (
              <p className="text-xs text-ink-muted">无同行人时记为个人支出（可在设置里加朋友）</p>
            )}
          </form>

          {error && !editing && <p className="mt-3 text-sm text-danger">{error}</p>}

          <ul className="mt-4 space-y-2">
            {expenses.length === 0 ? (
              <li className="rounded-card border border-line bg-surface px-3 py-6 text-center text-sm text-ink-muted shadow-warm">
                先录入项目和金额
              </li>
            ) : (
              expenses.map((exp) => {
                const sharedExp = isSharedExpense(exp, me);
                const title = exp.note?.trim() || "支出";
                const others = exp.splits
                  .map((s) => s.member)
                  .filter((m) => m !== me)
                  .join("、");
                return (
                  <li
                    key={exp.id}
                    className="rounded-card border border-line bg-surface px-3 py-2 shadow-warm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-0.5 self-stretch rounded-full bg-accent-dark/40" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openEdit(exp)}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="min-w-0 truncate text-[15px] font-medium">
                            {title}
                            {sharedExp && (
                              <span className="ml-1.5 text-[11px] font-normal text-info">共同</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-[15px] font-semibold">
                            {yuan(exp.amount)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {sharedExp ? `与 ${others} 分摊` : "个人"}
                          {" · 点按编辑"}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label="删除"
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-ink-muted"
                        onClick={() => void onDelete(exp)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {transfers.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-ink-muted">朋友应付我</h2>
              <ul className="mt-2 space-y-2">
                {transfers.map((t, i) => (
                  <li
                    key={`${t.from}-${t.to}-${i}`}
                    className="rounded-card border border-line bg-surface px-3 py-2 text-[15px] shadow-warm"
                  >
                    {t.from}
                    <span className="ml-2 font-semibold tabular-nums">{yuan(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Sheet open={!!editing} onClose={() => setEditing(null)} aria-label="编辑账单">
            <form onSubmit={(e) => void onSaveEdit(e)} className="space-y-3">
              <p className="text-sm font-medium">编辑账单</p>
              {error && <p className="text-sm text-danger">{error}</p>}
              <input
                className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
                placeholder="花费项目"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                required
                autoFocus
              />
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm tabular-nums outline-none"
                placeholder="金额"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
              {friends.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-ink-muted">共同分摊（勾选朋友）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {friends.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditFriendOn((prev) => toggleFriend(prev, m))}
                        className={`h-8 rounded-full px-3 text-xs ${
                          editFriendOn.includes(m)
                            ? "bg-accent text-accent-dark"
                            : "bg-surface-2 text-accent-dark"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={busy}>
                  保存
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  取消
                </Button>
              </div>
            </form>
          </Sheet>
        </div>
      )}
    </div>
  );
}
