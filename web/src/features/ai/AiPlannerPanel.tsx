import { useState } from "react";
import {
  commitPlan,
  extractPois,
  planItinerary,
  type CandidatePoi,
  type DraftDay,
} from "@/api/ai";
import { isErr } from "@/api/client";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";

type Step = "paste" | "picks" | "draft";

export function AiPlannerPanel({
  tripId,
  onCommitted,
}: {
  tripId: string;
  onCommitted: (trip: TripDetail) => void;
}) {
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cands, setCands] = useState<CandidatePoi[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<DraftDay[]>([]);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [extractSource, setExtractSource] = useState<"llm" | "rules" | null>(null);

  async function onExtract() {
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    const res = await extractPois(text);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    if (res.data.places.length === 0) {
      setError("没识别到地点。可换行、用顿号分隔，或写《景点名》");
      return;
    }
    setCands(res.data.places);
    setExtractSource(res.data.source);
    setSelected(new Set(res.data.places.map((_, i) => i)));
    setStep("picks");
  }

  async function onPlan() {
    const pois = cands
      .filter((_, i) => selected.has(i))
      .map((c) => ({
        name: c.name,
        amapId: c.amapId,
        lng: c.lng,
        lat: c.lat,
        city: c.city,
        category: c.category,
      }));
    if (pois.length === 0) {
      setError("至少勾一个地点");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await planItinerary(tripId, pois);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setDraft(res.data);
    setStep("draft");
  }

  async function onCommit() {
    setBusy(true);
    setError(null);
    const res = await commitPlan(tripId, draft);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    onCommitted(res.data);
    setDoneMsg("已写入行程，可到「行程」查看");
    setStep("paste");
    setText("");
    setCands([]);
    setDraft([]);
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function reset() {
    setStep("paste");
    setError(null);
    setDoneMsg(null);
  }

  return (
    <div className="flex flex-col">
      <p className="mb-3 text-sm font-semibold">AI 排程</p>
      <p className="mb-3 text-xs text-ink-muted">
        草稿确认前不会改行程；写入后可在「行程」里微调。未配置 LLM 时用规则解析（换行/顿号/《书名号》/地名后缀）+ 高德匹配。
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {doneMsg && <p className="mb-3 text-sm text-ok">{doneMsg}</p>}

      {step === "paste" && (
        <>
          <textarea
            className="min-h-[180px] w-full rounded-btn bg-surface-2 p-3 text-sm outline-none"
            placeholder={"上午去宽窄巷子，中午锦里吃饭\n下午：大熊猫基地 → 春熙路\n《三星堆博物馆》"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={busy || !text.trim()}
            onClick={() => void onExtract()}
          >
            {busy ? "识别中…" : "提取地点"}
          </Button>
        </>
      )}

      {step === "picks" && (
        <>
          {extractSource === "rules" && (
            <p className="mb-2 text-xs text-ink-muted">已用规则解析（无 LLM），请核对勾选</p>
          )}
          <ul className="space-y-2">
            {cands.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={`flex w-full items-start gap-3 rounded-card border px-3 py-2 text-left ${
                    selected.has(i) ? "border-accent bg-accent/15" : "border-line"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border text-xs ${
                      selected.has(i) ? "border-ok bg-ok text-white" : "border-line"
                    }`}
                  >
                    {selected.has(i) ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{c.name}</span>
                    <span className="text-xs text-ink-muted">
                      {c.resolved ? c.address ?? "已匹配坐标" : "无坐标，将按名称写入"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={reset}>
              重来
            </Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={() => void onPlan()}>
              {busy ? "生成中…" : "生成草稿"}
            </Button>
          </div>
        </>
      )}

      {step === "draft" && (
        <>
          <div className="space-y-4">
            {draft.map((d, di) => (
              <div key={d.dayId}>
                <p className="mb-1 text-sm font-semibold">
                  第 {di + 1} 天 · {d.date.slice(5, 10)}
                </p>
                {d.items.length === 0 ? (
                  <p className="text-xs text-ink-muted">空</p>
                ) : (
                  <ol className="space-y-1 text-sm">
                    {d.items.map((it, ii) => (
                      <li key={`${d.dayId}-${ii}`} className="tabular-nums">
                        {it.startTime ?? "—"} {it.name}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("picks")}>
              上一步
            </Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={() => void onCommit()}>
              {busy ? "写入中…" : "写入行程"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
