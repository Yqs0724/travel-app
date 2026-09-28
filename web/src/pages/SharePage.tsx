import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { clearEditToken, isErr, setEditToken } from "@/api/client";
import { clearDayItems, itemTitle, legLabel, type ItineraryItem, type TripDay } from "@/api/planner";
import { getShare, unlockShare, type AaShareSnapshot, type ShareTrip } from "@/api/share";
import { parseMembers } from "@/api/trips";
import { Sheet } from "@/components/Sheet";
import { IconMap, IconUnlock, IconWallet } from "@/components/Icons";
import { AaShareView } from "@/features/budget/AaShareView";
import { ExpensePanel } from "@/features/budget/ExpensePanel";
import { AddPlaceForm } from "@/features/planner/AddPlaceForm";
import { ItemEditSheet } from "@/features/planner/ItemEditSheet";
import { MapView } from "@/features/planner/MapView";
import { useTripLive } from "@/hooks/useTripLive";

const NAME_KEY = "triptrace_collab_name";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function dayMeta(iso: string, index: number) {
  const d = new Date(iso);
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const week = WEEK[d.getUTCDay()] ?? "";
  const short = `${mmdd} 周${week}`;
  return { title: `第 ${index + 1} 天 · ${short}`, short };
}

const SNAP = { half: 42, full: 72, peek: 13 } as const;
type Snap = "half" | "full" | "peek";
type ShareTab = "plan" | "budget";

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const aaFor = searchParams.get("for");
  const [aaSnap, setAaSnap] = useState<AaShareSnapshot | null>(null);
  const [trip, setTrip] = useState<ShareTrip | null>(null);
  const [canEditLink, setCanEditLink] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [editToken, setEditTokenState] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [tab, setTab] = useState<ShareTab>("plan");
  const [error, setError] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ item: ItineraryItem; index: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const daySwipe = useRef<{ x: number; y: number } | null>(null);
  const [liveName, setLiveName] = useState(
    () => sessionStorage.getItem(NAME_KEY)?.trim() || "协作者",
  );
  const [syncHint, setSyncHint] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void getShare(token).then((res) => {
      if (isErr(res)) {
        setError(res.message);
        return;
      }
      if (res.data.kind === "aa") {
        setAaSnap(res.data);
        return;
      }
      setTrip(res.data.trip);
      setCanEditLink(res.data.canEdit);
      setEditVersion(res.data.editVersion);
    });
  }, [token]);

  const reloadShare = useCallback(async () => {
    if (!token) return;
    const res = await getShare(token);
    if (isErr(res) || res.data.kind === "aa") return;
    setTrip(res.data.trip);
    setEditVersion(res.data.editVersion);
  }, [token]);

  const live = useTripLive({
    tripId: trip?.id,
    sinceVersion: editVersion,
    name: liveName,
    token: editToken,
    enabled: editing && !!editToken && !!trip?.id,
    onRemoteChange: (v) => {
      void reloadShare().then(() => {
        setSyncHint(`已同步他人修改（v${v}）`);
        window.setTimeout(() => setSyncHint(null), 2500);
      });
    },
  });

  useEffect(() => {
    const el = dotRefs.current[dayIndex];
    const scroller = el?.closest("[data-day-dots]");
    if (!el || !(scroller instanceof HTMLElement)) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left) });
  }, [dayIndex]);

  const day = useMemo(() => {
    if (!trip?.days.length) return null;
    const i = Math.min(Math.max(dayIndex, 0), trip.days.length - 1);
    return trip.days[i] ?? null;
  }, [trip, dayIndex]);

  const items = day?.items ?? [];
  const noCoordCount = items.filter((i) => !i.poi).length;
  const writeOpts = editing && editToken ? { token: editToken, expectedVersion: editVersion } : undefined;
  const budgetOpts = editing && editToken ? { token: editToken } : undefined;

  const onDayChange = useCallback((next: TripDay) => {
    if (next.editVersion != null) setEditVersion(next.editVersion);
    setTrip((prev) => {
      if (!prev) return prev;
      return { ...prev, days: prev.days.map((d) => (d.id === next.id ? next : d)) };
    });
  }, []);

  async function onClearDay() {
    if (!editing || !day || day.items.length === 0 || clearing) return;
    if (!confirm(`清空今天的 ${day.items.length} 个地点？不可恢复`)) return;
    setClearing(true);
    setError(null);
    const res = await clearDayItems(day.id, writeOpts);
    setClearing(false);
    if (isErr(res)) {
      setError(res.message || "清空失败");
      return;
    }
    onDayChange(res.data);
    setSheet(null);
    setFocusId(null);
  }

  const openItem = useCallback((item: ItineraryItem, index: number) => {
    setSheet({ item, index });
    setFocusId(item.id);
  }, []);

  async function onUnlock() {
    if (!token) return;
    setUnlockError(null);
    const res = await unlockShare(token);
    if (isErr(res)) {
      setUnlockError(res.message);
      return;
    }
    let name = sessionStorage.getItem(NAME_KEY)?.trim();
    if (!name) {
      const typed = window.prompt("怎么称呼你？（给其他人看）", "朋友");
      name = typed?.trim() || "协作者";
      sessionStorage.setItem(NAME_KEY, name);
    }
    setLiveName(name);
    setEditToken(res.data.token);
    setEditTokenState(res.data.token);
    setEditVersion(res.data.editVersion);
    setMembers(parseMembers(res.data.members));
    setTrip(res.data.trip);
    setEditing(true);
    setTab("plan");
  }

  function onLock() {
    clearEditToken();
    setEditTokenState(null);
    setEditing(false);
    setTab("plan");
    setSheet(null);
    setAddOpen(false);
  }

  function heightVh() {
    return dragH ?? SNAP[snap];
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { y: e.clientY, h: heightVh() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    const vh = (dy / window.innerHeight) * 100;
    setDragH(Math.min(80, Math.max(10, dragRef.current.h + vh)));
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    const h = heightVh();
    const dist = (s: Snap) => Math.abs(h - SNAP[s]);
    const best = (["peek", "half", "full"] as Snap[]).reduce((a, b) => (dist(b) < dist(a) ? b : a));
    setSnap(best);
    setDragH(null);
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pt-16">
        <p className="text-center text-sm text-danger">{error}</p>
        <p className="mt-2 text-center text-xs text-ink-muted">链接无效或已过期</p>
      </div>
    );
  }

  if (aaSnap) {
    return <AaShareView snap={aaSnap} forFriend={aaFor} />;
  }

  if (!trip) {
    return <p className="px-4 pt-16 text-center text-sm text-ink-muted">加载中…</p>;
  }

  const dayDate = day ? dayMeta(day.date, dayIndex) : null;

  function goDay(i: number) {
    setDayIndex(i);
    setSheet(null);
    setFocusId(null);
    setAddOpen(false);
  }

  function onDaySwipeDown(e: React.PointerEvent) {
    if (tab === "budget") return;
    if ((e.target as HTMLElement).closest("input,textarea,select,[data-map]")) return;
    daySwipe.current = { x: e.clientX, y: e.clientY };
  }

  function onDaySwipeEnd(e: React.PointerEvent) {
    const start = daySwipe.current;
    daySwipe.current = null;
    if (!start || !trip) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    // 右滑下一天，左滑上一天
    const next = dayIndex + (dx > 0 ? 1 : -1);
    if (next < 0 || next >= trip.days.length) return;
    goDay(next);
  }

  return (
    <div
      className="mx-auto flex h-dvh max-w-[480px] touch-pan-y flex-col overflow-hidden bg-bg"
      onPointerDownCapture={onDaySwipeDown}
      onPointerUpCapture={onDaySwipeEnd}
      onPointerCancelCapture={onDaySwipeEnd}
    >
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">{editing ? "行迹 · 协作编辑中" : "行迹 · 只读"}</p>
          {editing && (
            <button type="button" className="text-xs text-ink-muted" onClick={onLock}>
              退出编辑
            </button>
          )}
        </div>
        <h1 className="truncate text-base font-semibold">{trip.title}</h1>
        {canEditLink && !editing && (
          <button
            type="button"
            onClick={() => void onUnlock()}
            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-accent text-sm text-accent-dark"
          >
            <IconUnlock size={16} />
            进入编辑
          </button>
        )}
        {unlockError && <p className="mt-1 text-xs text-danger">{unlockError}</p>}
        {editing && (
          <div className="mt-2 flex gap-1 rounded-full bg-surface-2 p-1">
            {(
              [
                ["plan", "行程", IconMap],
                ["budget", "记账", IconWallet],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-sm ${
                  tab === k ? "bg-bg font-medium text-ink shadow-warm" : "text-ink-muted"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {live.others.length > 0 && (
        <p className="shrink-0 border-b border-line bg-accent/15 px-4 py-1.5 text-center text-[11px] text-accent-dark">
          {live.others.map((p) => p.name).join("、")} 也在编辑
        </p>
      )}
      {syncHint && (
        <p className="shrink-0 px-4 py-1 text-center text-[11px] text-ok">{syncHint}</p>
      )}

      {editing && tab === "budget" && budgetOpts ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ExpensePanel tripId={trip.id} members={members} apiOpts={budgetOpts} />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-4 pb-2 pt-3">
            <p className="text-center text-sm font-semibold tabular-nums">{dayDate?.title}</p>
            <div
              className="mt-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-day-dots
            >
              <div className="mx-auto flex w-max justify-center gap-0.5">
                {trip.days.map((d, i) => {
                  const meta = dayMeta(d.date, i);
                  const active = i === dayIndex;
                  return (
                    <button
                      key={d.id}
                      ref={(el) => {
                        dotRefs.current[i] = el;
                      }}
                      type="button"
                      aria-label={meta.title}
                      aria-current={active ? "true" : undefined}
                      onClick={() => goDay(i)}
                      className="flex shrink-0 items-center justify-center p-2"
                    >
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${
                          active ? "bg-accent" : "border border-accent-dark/30 bg-transparent"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="relative z-0 min-h-0 flex-1 isolate">
            {day ? (
              <MapView
                items={day.items}
                focusId={focusId}
                onSelectPoint={(id) => {
                  const idx = day.items.findIndex((x) => x.id === id);
                  const it = day.items[idx];
                  if (it && idx >= 0) openItem(it, idx);
                }}
                className="h-full w-full"
              />
            ) : null}
          </div>

          <div
            className="absolute inset-x-0 bottom-0 z-drawer mx-auto flex max-w-[480px] flex-col rounded-t-[20px] border border-b-0 border-line bg-bg shadow-warm"
            style={{
              height: `${heightVh()}vh`,
              maxHeight: "calc(100% - 4rem)",
              transition: dragH == null ? "height 0.2s ease" : undefined,
            }}
          >
            <div
              className="shrink-0 cursor-grab touch-none select-none px-4 pb-1 pt-2"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="button"
              aria-label="拖动调整目录高度"
            >
              <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-line" />
              <p className="relative text-center text-sm font-semibold">
                今日 · {dayDate?.short ?? ""} · {items.length} 站
                {noCoordCount > 0 && (
                  <span className="ml-1 text-xs font-normal text-warn">（{noCoordCount} 站无坐标）</span>
                )}
                {editing && items.length > 0 && (
                  <button
                    type="button"
                    className="absolute right-0 top-0 text-xs font-normal text-danger disabled:opacity-50"
                    disabled={clearing}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onClearDay();
                    }}
                  >
                    {clearing ? "清空中…" : "清空"}
                  </button>
                )}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {items.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">这一天还没有安排</p>
              ) : (
                <ul>
                  {items.map((item, index) => {
                    const active = focusId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          className={`flex w-full items-center gap-3 rounded-btn px-2 py-3 text-left ${
                            active ? "bg-accent/25" : ""
                          }`}
                          onClick={() => openItem(item, index)}
                        >
                          <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-accent-dark">
                            {index + 1}
                          </span>
                          <span
                            className={`min-w-0 flex-1 truncate text-[15px] ${
                              active ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {itemTitle(item)}
                          </span>
                        </button>
                        {index < items.length - 1 && item.legToNext && (
                          <p className="pb-1 pl-11 text-[11px] text-ink-muted">{legLabel(item.legToNext)}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {editing && day && (
                <div className="mt-3">
                  {addOpen ? (
                    <AddPlaceForm
                      day={day}
                      tripDays={trip.days}
                      writeOpts={writeOpts}
                      onDayChange={onDayChange}
                      onDone={() => setAddOpen(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-full bg-surface-2 py-3 text-sm text-accent-dark"
                      onClick={() => setAddOpen(true)}
                    >
                      添加地点
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sheet && day && editing && tab === "plan" && (
        <ItemEditSheet
          day={day}
          item={sheet.item}
          index={sheet.index}
          tripDays={trip.days}
          writeOpts={writeOpts}
          onDayChange={(next) => {
            onDayChange(next);
            const idx = next.items.findIndex((x) => x.id === sheet.item.id);
            if (idx >= 0) setSheet({ item: next.items[idx]!, index: idx });
            else setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet && !editing && (
        <Sheet open onClose={() => setSheet(null)} aria-label="地点详情">
          <p className="text-xs text-ink-muted">第 {sheet.index + 1} 站</p>
          <p className="text-lg font-semibold">{itemTitle(sheet.item)}</p>
          {sheet.item.legToNext && (
            <p className="text-sm text-ink-muted">前往下一站 · {legLabel(sheet.item.legToNext)}</p>
          )}
          {sheet.item.note && <p className="text-sm">{sheet.item.note}</p>}
          <button
            type="button"
            className="mt-2 w-full rounded-full bg-surface-2 py-3 text-sm text-accent-dark"
            onClick={() => setSheet(null)}
          >
            关闭
          </button>
        </Sheet>
      )}
    </div>
  );
}
