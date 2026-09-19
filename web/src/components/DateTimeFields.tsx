import { useEffect, useMemo, useRef, useState } from "react";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseISODate(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function formatDateLabel(iso: string) {
  const p = parseISODate(iso);
  if (!p) return iso || "选择日期";
  return `${p.y}年${p.m}月${p.d}日`;
}

const fieldBtn =
  "flex h-11 w-full items-center justify-between rounded-btn bg-bg px-3 text-left text-sm tabular-nums text-ink outline-none";

/** 自绘日期选择，配色跟行迹界面一致（避开系统蓝弹窗） */
export function DateField({
  value,
  onChange,
  className = "",
  buttonClassName = "",
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const initial = selected ?? (() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
  })();
  const [cursor, setCursor] = useState({ y: initial.y, m: initial.m });

  useEffect(() => {
    if (!open) return;
    if (selected) setCursor({ y: selected.y, m: selected.m });
  }, [open, selected?.y, selected?.m]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cells = useMemo(() => {
    const firstDow = new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay();
    const dim = daysInMonth(cursor.y, cursor.m);
    const out: Array<{ key: string; label: number; iso: string | null; muted: boolean }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ key: `e${i}`, label: 0, iso: null, muted: true });
    for (let d = 1; d <= dim; d++) {
      out.push({
        key: `${cursor.y}-${cursor.m}-${d}`,
        label: d,
        iso: toISODate(cursor.y, cursor.m, d),
        muted: false,
      });
    }
    return out;
  }, [cursor.y, cursor.m]);

  function shiftMonth(delta: number) {
    let y = cursor.y;
    let m = cursor.m + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setCursor({ y, m });
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className={`mt-1 ${fieldBtn} ${buttonClassName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{formatDateLabel(value)}</span>
        <span className="text-ink-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="mt-1 rounded-btn border border-line bg-bg p-3 shadow-warm">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="h-8 w-8 rounded-btn text-accent-dark"
              onClick={() => shiftMonth(-1)}
              aria-label="上一月"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-accent-dark">
              {cursor.y}年{cursor.m}月
            </span>
            <button
              type="button"
              className="h-8 w-8 rounded-btn text-accent-dark"
              onClick={() => shiftMonth(1)}
              aria-label="下一月"
            >
              ›
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-ink-muted">
            {WEEK.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c) =>
              c.iso ? (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    onChange(c.iso!);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-btn text-sm tabular-nums ${
                    c.iso === value
                      ? "bg-accent-dark text-bg"
                      : "text-ink hover:bg-surface-2"
                  }`}
                >
                  {c.label}
                </button>
              ) : (
                <span key={c.key} className="h-8" />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

/** 自绘 24 小时时刻选择 */
export function TimeField({
  value,
  onChange,
  className = "",
  buttonClassName = "",
}: {
  value: string;
  onChange: (hm: string) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hour = (value || "18:00").slice(0, 2);
  const minute = (value || "18:00").slice(3, 5);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(h: string, m: string) {
    onChange(`${h}:${m}`);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className={`mt-1 ${fieldBtn} ${buttonClassName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{value || "选择时刻"}</span>
        <span className="text-ink-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="mt-1 flex gap-2 rounded-btn border border-line bg-bg p-2 shadow-warm">
          <ul className="max-h-40 flex-1 overflow-y-auto rounded-btn bg-surface-2/60 p-1 scroll-warm">
            {HOURS.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  className={`h-8 w-full rounded-btn text-sm tabular-nums ${
                    h === hour ? "bg-accent-dark text-bg" : "text-ink hover:bg-surface-2"
                  }`}
                  onClick={() => pick(h, minute || "00")}
                >
                  {h}
                </button>
              </li>
            ))}
          </ul>
          <ul className="max-h-40 flex-1 overflow-y-auto rounded-btn bg-surface-2/60 p-1 scroll-warm">
            {MINUTES.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  className={`h-8 w-full rounded-btn text-sm tabular-nums ${
                    m === minute ? "bg-accent-dark text-bg" : "text-ink hover:bg-surface-2"
                  }`}
                  onClick={() => {
                    pick(hour || "18", m);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
