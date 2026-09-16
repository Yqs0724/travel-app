import { useRef, useState } from "react";
import {
  commitPlan,
  extractPois,
  planItinerary,
  type CandidatePoi,
  type DraftDay,
} from "@/api/ai";
import { readImageAsDataUrl } from "@/api/budget";
import { isErr } from "@/api/client";
import type { TripDetail } from "@/api/trips";
import { Button } from "@/components/Button";

type Step = "paste" | "picks" | "draft";
type PasteKind = "notes" | "dianping";
type LocalImage = { id: string; preview: string; mime: "image/jpeg" | "image/png" | "image/webp"; data: string };

const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseDataUrl(dataUrl: string): { mime: LocalImage["mime"]; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1]!.toLowerCase() as LocalImage["mime"], data: m[2]! };
}

export function AiPlannerPanel({
  tripId,
  onCommitted,
}: {
  tripId: string;
  onCommitted: (trip: TripDetail) => void;
}) {
  const [kind, setKind] = useState<PasteKind>("notes");
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cands, setCands] = useState<CandidatePoi[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<DraftDay[]>([]);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [extractSource, setExtractSource] = useState<"llm" | "rules" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const dianping = kind === "dianping";

  async function onExtract() {
    if (!text.trim() && images.length === 0) {
      setError("请粘贴文字或添加截图");
      return;
    }
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    setCopied(null);
    const res = await extractPois(
      text,
      undefined,
      dianping ? "restaurants" : "all",
      images.map((img) => ({ mime: img.mime, data: img.data })),
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    if (res.data.places.length === 0) {
      setError(
        dianping
          ? "没识别到餐馆。可粘贴点评店名，或上传截图"
          : "没识别到地点。可粘贴文字、上传截图，或写《景点名》",
      );
      return;
    }
    setCands(res.data.places);
    setExtractSource(res.data.source);
    setSelected(new Set(res.data.places.map((_, i) => i)));
    setStep("picks");
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = 3 - images.length;
    if (room <= 0) {
      setError("最多 3 张图片");
      return;
    }
    const next: LocalImage[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!MIME_OK.has(file.type)) {
        setError("仅支持 jpg / png / webp");
        continue;
      }
      try {
        const dataUrl = await readImageAsDataUrl(file);
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) {
          setError("图片格式无效");
          continue;
        }
        next.push({
          id: `${Date.now()}-${file.name}`,
          preview: dataUrl,
          mime: parsed.mime,
          data: parsed.data,
        });
      } catch (e) {
        setError((e as Error).message || "读取图片失败");
      }
    }
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
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
    setImages([]);
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
    setCopied(null);
  }

  function switchKind(next: PasteKind) {
    if (next === kind) return;
    setKind(next);
    setStep("paste");
    setText("");
    setImages([]);
    setCands([]);
    setDraft([]);
    setError(null);
    setDoneMsg(null);
    setCopied(null);
    setExtractSource(null);
  }

  async function copyName(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
    } catch {
      setError("复制失败，请手动长按店名");
    }
  }

  return (
    <div className="flex flex-col">
      <p className="mb-3 text-sm font-semibold">AI 排程</p>

      <div className="mb-3 flex gap-2">
        {(
          [
            ["notes", "笔记攻略"],
            ["dianping", "大众点评"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => switchKind(id)}
            className={`h-8 rounded-full px-3 text-sm ${
              kind === id ? "bg-accent text-accent-dark" : "bg-surface-2 text-accent-dark"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-ink-muted">
        {dianping
          ? "粘贴点评文案或上传截图 → 餐馆候选；复制店名后到「行程 → 添加地点」加入。看图需已配置多模态 LLM。"
          : "粘贴笔记或上传截图提取景点与餐饮；确认后再写入。看图需多模态模型（如 DeepSeek Flash）。"}
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {doneMsg && <p className="mb-3 text-sm text-ok">{doneMsg}</p>}

      {step === "paste" && (
        <>
          <textarea
            className="min-h-[140px] w-full rounded-btn bg-surface-2 p-3 text-sm outline-none"
            placeholder={
              dianping
                ? "粘贴大众点评文案（可选），或下方加截图"
                : "粘贴笔记文字（可选），或下方加截图\n例：宽窄巷子 → 锦里"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void onPickFiles(e.target.files)}
          />

          {images.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {images.map((img) => (
                <li key={img.id} className="relative h-16 w-16 overflow-hidden rounded-btn border border-line">
                  <img src={img.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-xs text-white"
                    aria-label="移除图片"
                    onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 text-sm"
              disabled={busy || images.length >= 3}
              onClick={() => fileRef.current?.click()}
            >
              {images.length >= 3 ? "已满 3 张" : "添加图片"}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || (!text.trim() && images.length === 0)}
              onClick={() => void onExtract()}
            >
              {busy ? "识别中…" : dianping ? "提取餐馆" : "提取地点"}
            </Button>
          </div>
        </>
      )}

      {step === "picks" && (
        <>
          {extractSource === "rules" && (
            <p className="mb-2 text-xs text-ink-muted">已用规则解析（无 LLM），请核对</p>
          )}
          {dianping && copied ? (
            <p className="mb-2 text-xs text-ok">已复制「{copied}」</p>
          ) : null}
          <ul className="space-y-2">
            {cands.map((c, i) =>
              dianping ? (
                <li
                  key={`${c.name}-${i}`}
                  className="flex items-center gap-2 rounded-card border border-line px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{c.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {c.resolved ? c.address ?? c.category ?? "已匹配" : "未匹配，可手搜加入"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 shrink-0 px-3 text-sm"
                    onClick={() => void copyName(c.name)}
                  >
                    复制
                  </Button>
                </li>
              ) : (
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
              ),
            )}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={reset}>
              重来
            </Button>
            {dianping ? null : (
              <Button type="button" className="flex-1" disabled={busy} onClick={() => void onPlan()}>
                {busy ? "生成中…" : "生成草稿"}
              </Button>
            )}
          </div>
          {dianping ? (
            <p className="mt-3 text-xs text-ink-muted">到「行程 → 添加地点」粘贴店名搜索即可加入</p>
          ) : null}
        </>
      )}

      {step === "draft" && !dianping && (
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
