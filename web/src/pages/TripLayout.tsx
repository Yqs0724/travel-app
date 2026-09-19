import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  parseMembers,
  updateTrip,
  type TripDetail,
  type TripSummary,
} from "@/api/trips";
import { createAaShare, createEditShare, createShare, getShare, listShares, revokeShare, type AaShareSnapshot, type ShareLinkRow } from "@/api/share";
import { isErr } from "@/api/client";
import type { WriteOpts } from "@/api/planner";
import { Button } from "@/components/Button";
import {
  IconEdit,
  IconKey,
  IconLogout,
  IconReview,
  IconShare,
  IconTrash,
  IconWallet,
} from "@/components/Icons";
import { MembersEditor } from "@/components/MembersEditor";
import { Sheet } from "@/components/Sheet";
import { TripTabBar } from "@/components/TripTabBar";
import { aaExportFilename, downloadAaHtml, exportAaBundle, filterAaSnap, friendsOnAa, printAaHtml } from "@/features/budget/aaExport";
import { useTripLive } from "@/hooks/useTripLive";
import { useAuthStore } from "@/stores/auth";

function fmtRange(start: string, end: string) {
  const a = start.slice(0, 10);
  const b = end.slice(0, 10);
  return a === b ? a : `${a} → ${b}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** 登录后：有行程进最近一条，没有则停在空状态新建 */
export function HomeRedirect() {
  const [state, setState] = useState<"loading" | "empty" | { id: string }>("loading");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    void listTrips().then((res) => {
      if (isErr(res)) {
        setError(res.message);
        setState("empty");
        return;
      }
      const first = res.data[0];
      if (first) setState({ id: first.id });
      else setState("empty");
    });
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await createTrip({ title, startDate, endDate, members });
    setSaving(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    navigate(`/trips/${res.data.id}/plan`, { replace: true });
  }

  if (state === "loading") {
    return <p className="px-4 pt-10 text-center text-sm text-ink-muted">加载中…</p>;
  }
  if (typeof state === "object") {
    return <Navigate to={`/trips/${state.id}/plan`} replace />;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">行迹</h1>
        <Button variant="ghost" type="button" onClick={logout}>
          退出
        </Button>
      </div>
      <p className="mt-2 text-sm text-ink-muted">先建一个行程开始</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <form onSubmit={(e) => void onCreate(e)} className="mt-6 space-y-3">
        <input
          className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
          placeholder="行程名称，如：成都三日"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
        <div className="flex gap-3">
          <input
            type="date"
            className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <input
            type="date"
            className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
        <MembersEditor members={members} onChange={setMembers} />
        <Button type="submit" className="w-full" disabled={saving || !title.trim()}>
          {saving ? "创建中…" : "创建行程"}
        </Button>
      </form>
    </div>
  );
}

export function TripLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState(todayISO());
  const [newEnd, setNewEnd] = useState(todayISO());
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [sharesOpen, setSharesOpen] = useState(false);
  const [shares, setShares] = useState<ShareLinkRow[]>([]);
  const [sharesBusy, setSharesBusy] = useState(false);
  const [aaSheetOpen, setAaSheetOpen] = useState(false);
  const [aaSnap, setAaSnap] = useState<AaShareSnapshot | null>(null);
  const [aaUrl, setAaUrl] = useState<string | null>(null);
  const [aaBusy, setAaBusy] = useState(false);
  const [aaFriend, setAaFriend] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const tab = (() => {
    const last = location.pathname.split("/").filter(Boolean).pop() ?? "plan";
    return ["plan", "ai", "checklist", "budget"].includes(last) ? last : "plan";
  })();

  async function reloadTrip(tripId: string) {
    const res = await getTrip(tripId);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setTrip(res.data);
    setError(null);
  }

  const onRemoteChange = useCallback(
    (v: number) => {
      if (!id) return;
      void reloadTrip(id).then(() => {
        setShareHint(`行程已同步（v${v}）`);
        window.setTimeout(() => setShareHint(null), 2500);
      });
    },
    [id],
  );

  const live = useTripLive({
    tripId: id,
    sinceVersion: trip?.editVersion ?? 0,
    name: "主人",
    enabled: !!id && !!trip,
    onRemoteChange,
  });

  const writeOpts: WriteOpts | undefined = useMemo(
    () => (trip ? { expectedVersion: trip.editVersion } : undefined),
    [trip],
  );

  async function reloadList() {
    const res = await listTrips();
    if (!isErr(res)) setTrips(res.data);
  }

  useEffect(() => {
    if (!id) return;
    void reloadTrip(id);
    void reloadList();
  }, [id]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function goTrip(tripId: string) {
    setPickerOpen(false);
    navigate(`/trips/${tripId}/${tab}`);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    const res = await updateTrip(id, {
      title: editTitle.trim(),
      startDate: editStart,
      endDate: editEnd,
      members: editMembers,
    });
    setSaving(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setTrip(res.data);
    setEditOpen(false);
    void reloadList();
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await createTrip({
      title: newTitle.trim(),
      startDate: newStart,
      endDate: newEnd,
      members: newMembers,
    });
    setSaving(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setCreateOpen(false);
    setPickerOpen(false);
    setNewTitle("");
    setNewMembers([]);
    navigate(`/trips/${res.data.id}/${tab}`);
  }

  async function onDelete() {
    if (!id || !trip) return;
    if (!confirm(`删除行程「${trip.title}」？不可恢复`)) return;
    setMenuOpen(false);
    const res = await deleteTrip(id);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    const list = await listTrips();
    if (!isErr(list) && list.data[0]) {
      navigate(`/trips/${list.data[0].id}/${tab}`, { replace: true });
    } else {
      navigate("/trips", { replace: true });
    }
  }

  async function openShares() {
    if (!id) return;
    setMenuOpen(false);
    setSharesBusy(true);
    const res = await listShares(id);
    setSharesBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setShares(res.data);
    setSharesOpen(true);
  }

  async function onRevoke(token: string) {
    if (!id) return;
    if (!confirm("失效后旧链接将无法打开，确定？")) return;
    setSharesBusy(true);
    const res = await revokeShare(id, token);
    setSharesBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setShares(res.data);
    setShareHint("链接已失效");
    window.setTimeout(() => setShareHint(null), 2000);
  }

  async function onShare() {
    if (!id) return;
    setMenuOpen(false);
    setShareHint(null);
    const res = await createShare(id);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    const url = `${window.location.origin}${res.data.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint("只读链接已复制");
    } catch {
      setShareHint(url);
    }
    window.setTimeout(() => setShareHint(null), 2500);
  }

  async function onShareAa() {
    if (!id) return;
    setMenuOpen(false);
    setShareHint(null);
    setAaBusy(true);
    setAaSnap(null);
    setAaUrl(null);
    const res = await createAaShare(id);
    if (isErr(res)) {
      setAaBusy(false);
      setError(res.message);
      return;
    }
    const url = `${window.location.origin}${res.data.path}`;
    setAaUrl(url);
    const snapRes = await getShare(res.data.token);
    setAaBusy(false);
    if (isErr(snapRes) || snapRes.data.kind !== "aa") {
      setError(isErr(snapRes) ? snapRes.message : "无法加载 AA 账单");
      return;
    }
    setAaSnap(snapRes.data);
    const pals = friendsOnAa(snapRes.data);
    setAaFriend(pals.length === 1 ? pals[0]! : pals[0] ?? null);
    setAaSheetOpen(true);
  }

  function aaView() {
    if (!aaSnap || !aaFriend) return aaSnap;
    return filterAaSnap(aaSnap, aaFriend);
  }

  function aaLink() {
    if (!aaUrl) return null;
    if (!aaFriend) return aaUrl;
    return `${aaUrl}?for=${encodeURIComponent(aaFriend)}`;
  }

  async function copyAaLink() {
    const url = aaLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint("AA 链接已复制");
    } catch {
      setShareHint(url);
    }
    window.setTimeout(() => setShareHint(null), 2500);
  }

  async function downloadAa() {
    const view = aaView();
    if (!view) return;
    setAaBusy(true);
    try {
      downloadAaHtml(aaExportFilename(view), exportAaBundle(view));
      setShareHint("HTML 已下载");
      window.setTimeout(() => setShareHint(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
    setAaBusy(false);
  }

  async function printAa() {
    const view = aaView();
    if (!view) return;
    setError(null);
    setAaBusy(true);
    try {
      await printAaHtml(exportAaBundle(view));
      setShareHint("已调起打印；在系统框里选「存储为 PDF」");
      window.setTimeout(() => setShareHint(null), 3500);
    } catch (e) {
      setShareHint(e instanceof Error ? e.message : "打印失败，请改用下载 HTML");
      window.setTimeout(() => setShareHint(null), 4000);
    }
    setAaBusy(false);
  }

  async function onCollabShare() {
    if (!id) return;
    setMenuOpen(false);
    setShareHint(null);
    const res = await createEditShare(id);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    const url = `${window.location.origin}${res.data.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint("协作链接已复制");
    } catch {
      setShareHint(url);
    }
    window.setTimeout(() => setShareHint(null), 4000);
  }

  if (!id) return null;

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg px-2 py-1">
        <button
          type="button"
          className="flex min-h-11 max-w-[75%] items-center gap-1 px-2 text-left"
          onClick={() => {
            setMenuOpen(false);
            setPickerOpen(true);
            void reloadList();
          }}
        >
          <span className="truncate text-base font-semibold text-accent-dark">{trip?.title ?? "…"}</span>
          <span className="shrink-0 text-xs text-accent-dark">▾</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="更多"
            className="flex h-11 w-11 items-center justify-center text-lg tracking-widest text-accent-dark"
            onClick={() => {
              setPickerOpen(false);
              setMenuOpen((v) => !v);
            }}
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-30 min-w-[168px] overflow-hidden rounded-btn border border-line bg-bg shadow-warm">
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => {
                  setMenuOpen(false);
                  if (id) navigate(`/trips/${id}/review`);
                }}
              >
                <IconReview size={18} className="text-accent-dark" />
                旅行回顾
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => void onShare()}
              >
                <IconShare size={18} className="text-accent-dark" />
                分享（只读）
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => void onShareAa()}
              >
                <IconWallet size={18} className="text-accent-dark" />
                分享 AA 账单
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => void onCollabShare()}
              >
                <IconKey size={18} className="text-accent-dark" />
                协作编辑链接
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => void openShares()}
              >
                <IconShare size={18} className="text-accent-dark" />
                管理分享链接
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
                onClick={() => {
                  setMenuOpen(false);
                  if (trip) {
                    setEditTitle(trip.title);
                    setEditStart(trip.startDate.slice(0, 10));
                    setEditEnd(trip.endDate.slice(0, 10));
                    setEditMembers(parseMembers(trip.members));
                    setEditOpen(true);
                  }
                }}
              >
                <IconEdit size={18} className="text-accent-dark" />
                编辑行程
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-danger"
                onClick={() => void onDelete()}
              >
                <IconTrash size={18} />
                删除行程
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left text-sm text-ink-muted"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <IconLogout size={18} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}
      {live.others.length > 0 && (
        <p className="border-b border-line bg-accent/15 px-4 py-1.5 text-center text-[11px] text-accent-dark">
          {live.others.map((p) => p.name).join("、")} 也在编辑
        </p>
      )}
      {shareHint && (
        <p
          className={`px-4 pt-2 text-sm break-all ${
            /失败|无法|请改用/.test(shareHint) ? "text-danger" : "text-ok"
          }`}
        >
          {shareHint}
        </p>
      )}
      <Outlet context={{ trip, setTrip, writeOpts }} />
      <TripTabBar tripId={id} />

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} aria-label="切换行程">
        <p className="mb-3 text-sm font-semibold">切换行程</p>
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`w-full rounded-card border px-4 py-3 text-left ${
                  t.id === id ? "border-accent bg-accent/20" : "border-line"
                }`}
                onClick={() => goTrip(t.id)}
              >
                <div className="text-[15px] font-medium">{t.title}</div>
                <div className="mt-0.5 text-xs text-ink-muted tabular-nums">
                  {fmtRange(t.startDate, t.endDate)}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          className="mt-4 w-full"
          onClick={() => {
            setPickerOpen(false);
            setNewTitle("");
            setNewStart(todayISO());
            setNewEnd(todayISO());
            setNewMembers([]);
            setCreateOpen(true);
          }}
        >
          新建行程
        </Button>
      </Sheet>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} aria-label="新建行程">
        <form onSubmit={(e) => void onCreate(e)} className="space-y-3">
          <p className="font-semibold">新建行程</p>
          <input
            className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
            placeholder="行程名称"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            autoFocus
          />
          <div className="flex gap-3">
            <input
              type="date"
              className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              required
            />
            <input
              type="date"
              className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              required
            />
          </div>
          <MembersEditor members={newMembers} onChange={setNewMembers} />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              创建
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} aria-label="编辑行程">
        <form onSubmit={(e) => void onSaveEdit(e)} className="space-y-3">
          <p className="font-semibold">编辑行程</p>
          <input
            className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
            autoFocus
          />
          <div className="flex gap-3">
            <input
              type="date"
              className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              required
            />
            <input
              type="date"
              className="h-11 flex-1 rounded-btn bg-surface-2 px-3 text-sm outline-none"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              required
            />
          </div>
          <MembersEditor members={editMembers} onChange={setEditMembers} />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              保存
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              取消
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet open={sharesOpen} onClose={() => setSharesOpen(false)} aria-label="管理分享链接">
        <p className="mb-1 font-semibold">管理分享链接</p>
        <p className="mb-3 text-xs text-ink-muted">失效后旧链接打不开；再点「分享」会生成新链接</p>
        {sharesBusy && shares.length === 0 ? (
          <p className="text-sm text-ink-muted">加载中…</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-ink-muted">还没有分享链接</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li
                key={s.token}
                className="rounded-card border border-line px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {s.kind === "aa" ? "AA 账单" : s.canEdit ? "协作编辑" : "只读分享"}
                      {!s.active && (
                        <span className="ml-2 text-xs font-normal text-ink-muted">已失效</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{s.path}</p>
                  </div>
                  {s.active && (
                    <button
                      type="button"
                      disabled={sharesBusy}
                      className="shrink-0 text-sm text-danger"
                      onClick={() => void onRevoke(s.token)}
                    >
                      失效
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setSharesOpen(false)}>
          关闭
        </Button>
      </Sheet>

      <Sheet
        open={aaSheetOpen}
        onClose={() => {
          setAaSheetOpen(false);
          setAaSnap(null);
          setAaFriend(null);
          setError(null);
          setShareHint(null);
        }}
        aria-label="分享 AA 账单"
      >
        <p className="mb-1 font-semibold">分享 AA 账单</p>
        <p className="mb-3 text-xs text-ink-muted">勾选发给谁；小票上不出现名字</p>
        {aaBusy && !aaSnap ? (
          <p className="text-sm text-ink-muted">准备中…</p>
        ) : (
          <div className="space-y-3">
            {aaSnap && friendsOnAa(aaSnap).length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-ink-muted">发给</p>
                <div className="flex flex-wrap gap-1.5">
                  {friendsOnAa(aaSnap).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAaFriend(m)}
                      className={`h-8 rounded-full px-3 text-xs ${
                        aaFriend === m ? "bg-accent text-accent-dark" : "bg-surface-2 text-accent-dark"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-warn">还没有共同支出</p>
            )}
            <Button type="button" className="w-full" disabled={aaBusy || !aaUrl || !aaFriend} onClick={() => void copyAaLink()}>
              复制网页链接
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={aaBusy || !aaSnap || !aaFriend}
              onClick={() => void downloadAa()}
            >
              下载 HTML
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={aaBusy || !aaSnap || !aaFriend}
              onClick={() => void printAa()}
            >
              打印 / 另存为 PDF
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
