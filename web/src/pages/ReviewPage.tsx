import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { CATEGORY_LABELS, fetchReceiptObjectUrl, yuan } from "@/api/budget";
import { isErr } from "@/api/client";
import { getTripReview, reviewSummaryText, type TripReview } from "@/api/review";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";

type Ctx = {
  trip: TripDetail | null;
};

function fmtRange(a: string, b: string) {
  return a === b ? a : `${a} → ${b}`;
}

function fmtDur(min: number) {
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function ReviewPage() {
  const { id } = useParams();
  const { trip } = useOutletContext<Ctx>();
  const [data, setData] = useState<TripReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getTripReview(id).then((res) => {
      if (isErr(res)) {
        setError(res.message);
        return;
      }
      setData(res.data);
    });
  }, [id]);

  useEffect(() => {
    if (!data?.photos.length) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const p of data.photos) {
        const u = await fetchReceiptObjectUrl(p.expenseId);
        if (u) {
          created.push(u);
          if (!cancelled) next[p.expenseId] = u;
        }
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [data]);

  async function onCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(reviewSummaryText(data));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败");
    }
  }

  if (error && !data) {
    return <p className="px-4 pt-6 text-sm text-danger">{error}</p>;
  }
  if (!data) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">加载回顾…</p>;
  }

  const cats = Object.entries(data.spendByCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="px-4 pb-8 pt-2 desk-read">
      <div className="mb-5">
        <p className="text-xs text-ink-muted">旅行回顾</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-accent-dark">
          {data.title || trip?.title || "行程"}
        </h1>
        <p className="mt-1 text-sm tabular-nums text-ink-muted">
          {fmtRange(data.startDate, data.endDate)}
        </p>
      </div>

      <p className="text-[20px] font-semibold tabular-nums">{yuan(data.mySpend)}</p>
      <p className="mt-1 text-xs text-ink-muted">
        我承担
        {data.othersOweMe > 0 ? (
          <>
            {" · "}朋友应付我{" "}
            <span className="font-medium tabular-nums text-ink">{yuan(data.othersOweMe)}</span>
          </>
        ) : null}
        {data.paidOut !== data.mySpend ? (
          <>
            {" · "}掏出{" "}
            <span className="tabular-nums">{yuan(data.paidOut)}</span>
          </>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>
          天数 <span className="text-ink">{data.dayCount}</span>
        </span>
        <span>
          站点 <span className="text-ink">{data.stopCount}</span>
        </span>
        {data.legDistanceKm != null ? (
          <span>
            路程 <span className="text-ink">{data.legDistanceKm} km</span>
          </span>
        ) : null}
        {data.legDurationMin != null ? (
          <span>
            在途 <span className="text-ink">{fmtDur(data.legDurationMin)}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <Button type="button" variant="secondary" className="w-full" onClick={() => void onCopy()}>
          {copied ? "已复制" : "复制回顾摘要"}
        </Button>
      </div>

      {data.budget ? (
        <section className="mt-6">
          <p className="mb-2 text-[11px] font-medium text-info">预算对照</p>
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between gap-3">
              <span>预算（我付）</span>
              <span className="tabular-nums">{yuan(data.budget.planMine)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>实付（我承担）</span>
              <span className="tabular-nums">{yuan(data.mySpend)}</span>
            </li>
            {data.budget.openCount > 0 ? (
              <li className="flex justify-between gap-3 text-ink-muted">
                <span>未入账 {data.budget.openCount} 项</span>
                <span className="tabular-nums">{yuan(data.budget.openBill)}</span>
              </li>
            ) : null}
          </ul>
          <Link to="../budget" className="mt-2 inline-block text-xs text-accent-dark underline">
            去记账
          </Link>
        </section>
      ) : null}

      <section className="mt-6">
        <p className="mb-2 text-[11px] font-medium text-info">路线</p>
        <div className="space-y-4">
          {data.days.map((d, i) => (
            <div key={d.date}>
              <p className="mb-1 text-sm font-medium text-accent-dark">
                第 {i + 1} 天 · {d.date.slice(5)}
              </p>
              {d.stops.length === 0 ? (
                <p className="text-xs text-ink-muted">空</p>
              ) : (
                <ol className="space-y-0.5 text-sm">
                  {d.stops.map((s, j) => (
                    <li key={`${d.date}-${j}`} className="text-ink">
                      {s.name}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
        <Link to="../plan" className="mt-2 inline-block text-xs text-accent-dark underline">
          去行程
        </Link>
      </section>

      <section className="mt-6">
        <p className="mb-2 text-[11px] font-medium text-info">花费（我承担）</p>
        {cats.length === 0 ? (
          <p className="text-xs text-ink-muted">还没有记账</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {cats.map(([cat, amt]) => (
              <li key={cat} className="flex justify-between gap-3">
                <span className="text-ink">{CATEGORY_LABELS[cat] || cat}</span>
                <span className="tabular-nums text-ink-muted">{yuan(amt)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-line pt-1.5 font-medium">
              <span>合计</span>
              <span className="tabular-nums">{yuan(data.mySpend)}</span>
            </li>
          </ul>
        )}
      </section>

      <section className="mt-6">
        <p className="mb-2 text-[11px] font-medium text-info">照片</p>
        {data.photos.length === 0 ? (
          <p className="text-xs text-ink-muted">暂无账单附图（实付里上传小票会出现在此）</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {data.photos.map((p) => {
              const src = photoUrls[p.expenseId];
              return (
                <li key={p.expenseId}>
                  <button
                    type="button"
                    className="aspect-square w-full overflow-hidden rounded-btn bg-surface-2"
                    disabled={!src}
                    onClick={() => src && setLightbox(src)}
                  >
                    {src ? (
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-ink-muted">
                        …
                      </span>
                    )}
                  </button>
                  <p className="mt-0.5 truncate text-[10px] text-ink-muted">
                    {p.note?.trim() || CATEGORY_LABELS[p.category] || p.category}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {lightbox ? (
        <Sheet open onClose={() => setLightbox(null)} variant="lightbox" aria-label="照片">
          <img src={lightbox} alt="" className="max-h-[85vh] w-full rounded-card object-contain" />
        </Sheet>
      ) : null}
    </div>
  );
}
