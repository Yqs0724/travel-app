import { FormEvent, useEffect, useState } from "react";
import {
  CATEGORY_LABELS,
  addExpense,
  clearReceipt,
  deleteExpense,
  fetchReceiptObjectUrl,
  getBudgetSummary,
  getSettlement,
  listExpenses,
  readImageAsDataUrl,
  updateExpense,
  uploadReceipt,
  yuan,
  type BudgetSummary,
  type Expense,
  type Transfer,
} from "@/api/budget";
import { isErr, type ApiOpts } from "@/api/client";
import { updateTrip } from "@/api/trips";
import { Button } from "@/components/Button";
import { IconPlus, IconWallet } from "@/components/Icons";
import { MembersEditor } from "@/components/MembersEditor";
import { Sheet } from "@/components/Sheet";

const CATS = Object.keys(CATEGORY_LABELS);

function isSharedExpense(exp: Expense, me: string) {
  return exp.splits.some((s) => s.member !== me);
}

export function ExpensePanel({
  tripId,
  members,
  onMembersChange,
  apiOpts,
  allowAddMember = true,
}: {
  tripId: string;
  members: string[];
  onMembersChange?: (members: string[]) => void;
  apiOpts?: ApiOpts;
  allowAddMember?: boolean;
}) {
  const me = "我";
  const friends = members;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [sum, setSum] = useState<BudgetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [shared, setShared] = useState(false);
  const [friendOn, setFriendOn] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [showCats, setShowCats] = useState(false);

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
  }, [friends.join("|")]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function buildSplits() {
    if (!shared || friendOn.length === 0) {
      return [{ member: me, ratio: 1 }];
    }
    return [{ member: me, ratio: 1 }, ...friendOn.map((m) => ({ member: m, ratio: 1 }))];
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("金额无效");
      return;
    }
    if (shared && friendOn.length === 0) {
      setError("共同支出请至少勾选一位朋友");
      return;
    }
    const shop = note.trim();
    if (!shop) {
      setError("请填写店名");
      return;
    }
    const body = {
      category,
      amount: n,
      note: shop,
      payer: "我",
      splits: buildSplits(),
    };
    setBusy(true);
    const res = editingId
      ? await updateExpense(editingId, body, apiOpts)
      : await addExpense(tripId, { ...body, note: shop }, apiOpts);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setAmount("");
    setNote("");
    setShared(false);
    setFriendOn([]);
    setEditingId(null);
    setShowForm(false);
    setExpenses(res.data);
    void refresh();
  }

  function openEdit(exp: Expense) {
    setEditingId(exp.id);
    setAmount(String(exp.amount));
    setCategory(exp.category);
    setNote(exp.note ?? "");
    setShowCats(Boolean(exp.category && exp.category !== "other"));
    const others = exp.splits.map((s) => s.member).filter((m) => m !== me);
    setShared(others.length > 0);
    setFriendOn(others.filter((m) => friends.includes(m)));
    setShowForm(true);
    setError(null);
  }

  function openNew() {
    setEditingId(null);
    setAmount("");
    setNote("");
    setCategory("other");
    setShowCats(false);
    setShared(false);
    setFriendOn([]);
    setShowForm(true);
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
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

  async function persistMembers(next: string[]) {
    const list = next.map((m) => m.trim()).filter((m) => m && m !== "我");
    const res = await updateTrip(tripId, { members: list }, apiOpts);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    onMembersChange?.(parseMembersSafe(res.data.members));
  }

  function toggleFriend(m: string) {
    setFriendOn((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function onPickReceipt(exp: Expense, file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      const res = await uploadReceipt(exp.id, dataUrl, apiOpts);
      if (isErr(res)) {
        setError(res.message);
      } else {
        setError(null);
        setExpenses(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    }
    setBusy(false);
  }

  async function onViewReceipt(exp: Expense) {
    if (preview) URL.revokeObjectURL(preview);
    const url = await fetchReceiptObjectUrl(exp.id, apiOpts);
    if (!url) {
      setError("无法打开附图");
      return;
    }
    setPreview(url);
  }

  async function onClearReceipt(exp: Expense) {
    const res = await clearReceipt(exp.id, apiOpts);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setExpenses(res.data);
  }

  const myShare = sum?.myShare ?? sum?.total ?? 0;
  const othersOwe = sum?.othersOweMe ?? 0;

  return (
    <div className="px-4 pt-4 pb-8 desk-read">
      <p className="text-[20px] font-semibold tabular-nums">{yuan(sum?.total ?? 0)}</p>
      <p className="mt-1 text-xs text-ink-muted">我已支出</p>
      <div className="mt-2 flex gap-4 text-xs text-ink-muted">
        <p>
          自己承担 <span className="font-medium tabular-nums text-ink">{yuan(myShare)}</span>
        </p>
        <p>
          朋友应付我 <span className="font-medium tabular-nums text-ink">{yuan(othersOwe)}</span>
        </p>
      </div>

      {error && !showForm && <p className="mt-3 text-sm text-danger">{error}</p>}

      <Button type="button" className="mt-4 w-full gap-2" onClick={openNew}>
        <IconPlus size={18} className="text-white" />
        记一笔
      </Button>

      <Sheet open={showForm} onClose={closeForm} aria-label={editingId ? "编辑账单" : "记一笔"}>
        <form onSubmit={(e) => void onSave(e)} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <IconWallet size={18} className="text-accent-dark" />
            {editingId ? "编辑账单" : "记一笔"}
          </p>
          <p className="text-xs text-ink-muted">记的是你掏出去的钱（{me} 付的）</p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm tabular-nums outline-none"
            placeholder="金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
          <input
            className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
            placeholder="店名，如：蜀大侠火锅"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />

          <div>
            <button
              type="button"
              className="text-xs text-ink-muted"
              onClick={() => setShowCats((v) => !v)}
            >
              分类（可选）· {CATEGORY_LABELS[category] ?? category}
              {showCats ? " · 收起" : " · 展开"}
            </button>
            {showCats ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CATS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`h-8 rounded-full px-3 text-xs ${
                      category === c ? "bg-accent text-accent-dark" : "bg-surface-2 text-accent-dark"
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-dark,#6F584C)]"
              checked={shared}
              onChange={(e) => {
                setShared(e.target.checked);
                if (!e.target.checked) setFriendOn([]);
              }}
            />
            共同支出（朋友应付我一份）
          </label>

          {shared && (
            <div>
              <p className="mb-1.5 text-xs text-ink-muted">和谁分摊</p>
              {friends.length === 0 ? (
                <p className="text-xs text-warn">先在下方加同行人，才能勾选共同对象</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {friends.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleFriend(m)}
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
              )}
            </div>
          )}

          {allowAddMember && (
            <MembersEditor members={members} onChange={(next) => void persistMembers(next)} />
          )}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={busy}>
              {editingId ? "保存" : "记上"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              取消
            </Button>
          </div>
        </form>
      </Sheet>

      <ul className="mt-4 space-y-2">
        {expenses.map((exp) => {
          const sharedExp = isSharedExpense(exp, me);
          const title = exp.note?.trim() || CATEGORY_LABELS[exp.category] || exp.category;
          const catLabel = CATEGORY_LABELS[exp.category] ?? exp.category;
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
                    {exp.note?.trim() ? catLabel : null}
                    {exp.note?.trim() ? " · " : null}
                    {sharedExp
                      ? `与 ${exp.splits
                          .map((s) => s.member)
                          .filter((m) => m !== me)
                          .join("、")} 分摊`
                      : "个人"}
                    {exp.hasReceipt ? " · 有图" : ""}
                    <span className="text-ink-muted/80"> · 点按编辑</span>
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
              <div className="mt-2 flex flex-wrap gap-2 pl-2">
                <label className="cursor-pointer rounded-full bg-surface-2 px-3 py-1.5 text-xs text-accent-dark">
                  {exp.hasReceipt ? "换图" : "附图"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      void onPickReceipt(exp, e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {exp.hasReceipt && (
                  <>
                    <button
                      type="button"
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-accent-dark"
                      onClick={() => void onViewReceipt(exp)}
                    >
                      查看
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink-muted"
                      onClick={() => void onClearReceipt(exp)}
                    >
                      去图
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-6">
        <h2 className="text-base font-semibold">朋友应付我</h2>
        {transfers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">没有共同支出，或已两清</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {transfers.map((t, i) => (
              <li
                key={`${t.from}-${t.to}-${i}`}
                className="rounded-card border border-line px-3 py-3 text-[15px]"
              >
                {t.from} → {t.to}
                <span className="ml-2 font-semibold tabular-nums">{yuan(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet
        open={!!preview}
        onClose={() => {
          if (preview) URL.revokeObjectURL(preview);
          setPreview(null);
        }}
        variant="lightbox"
        aria-label="账单附图"
      >
        {preview && (
          <img
            src={preview}
            alt="账单附图"
            className="max-h-[85vh] w-full rounded-card object-contain"
          />
        )}
      </Sheet>
    </div>
  );
}

function parseMembersSafe(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return v.map((s) => s.trim()).filter((m) => m && m !== "我");
    }
  } catch {
    /* ignore */
  }
  return [];
}
