import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  applyAdjust,
  commitPlan,
  extractPois,
  planItinerary,
  proposeAdjust,
  type AdjustOp,
  type CandidatePoi,
  type DraftDay,
  type DraftItem,
} from "@/api/ai";
import { readImageAsDataUrl } from "@/api/budget";
import { isErr } from "@/api/client";
import { addItem, type TripDay, type WriteOpts } from "@/api/planner";
import {
  appendPending,
  getPending,
  setPending,
  type PendingPlace,
  type TripDetail,
} from "@/api/trips";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";

type Step = "paste" | "picks" | "draft";
type LocalImage = { id: string; preview: string; mime: "image/jpeg" | "image/png" | "image/webp"; data: string };

const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

const SELECT_ARROW = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6F584C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
)}")`;

function parseDataUrl(dataUrl: string): { mime: LocalImage["mime"]; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1]!.toLowerCase() as LocalImage["mime"], data: m[2]! };
}

function dayOptionLabel(day: TripDay, index: number) {
  return `第${index + 1}天 · ${day.date.slice(5, 10)}`;
}

function resolveDayId(p: PendingPlace, days: TripDay[]): string | null {
  if (!days.length) return null;
  const md = p.dayLabel && /(\d{2}-\d{2})/.exec(p.dayLabel)?.[1];
  if (md) {
    const hit = days.find((d) => d.date.slice(5, 10) === md);
    if (hit) return hit.id;
  }
  const n = p.dayLabel && /第\s*(\d+)\s*天/.exec(p.dayLabel)?.[1];
  if (n) {
    const idx = Number(n) - 1;
    if (days[idx]) return days[idx]!.id;
  }
  return days[0]!.id;
}

export function AiPlannerPanel({
  tripId,
  days,
  onCommitted,
  onDayChange,
  writeOpts,
}: {
  tripId: string;
  days: TripDay[];
  onCommitted: (trip: TripDetail) => void;
  onDayChange?: (day: TripDay) => void;
  writeOpts?: WriteOpts;
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
  const [images, setImages] = useState<LocalImage[]>([]);
  const [pending, setPendingList] = useState<PendingPlace[]>([]);
  const [joinTarget, setJoinTarget] = useState<PendingPlace | null>(null);
  const [joinDayId, setJoinDayId] = useState("");
  const [pendingOpen, setPendingOpen] = useState(false);
  const [adjPreview, setAdjPreview] = useState<{
    summary: string;
    ops: AdjustOp[];
    source: "llm" | "rules";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getPending(tripId).then((res) => {
      if (!isErr(res)) setPendingList(res.data);
    });
  }, [tripId]);

  function looksLikeAdjust(s: string) {
    return /(?:改到|调到|移到|放到|挪到)\s*第?\s*\d+\s*天|(?:改到|调到)\s*D\s*\d+|删除|去掉|移除|删掉|(?:改到|设为|时间为)\s*\d{1,2}\s*[:：点]/.test(
      s,
    );
  }

  async function onApplyAdjust() {
    if (!adjPreview?.ops.length) return;
    setBusy(true);
    setError(null);
    const res = await applyAdjust(tripId, adjPreview.ops);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    onCommitted(res.data);
    setDoneMsg(adjPreview.summary || "已应用微调");
    setAdjPreview(null);
    setText("");
  }

  async function onSend() {
    if (!text.trim() && images.length === 0) {
      setError("请输入内容、粘贴截图，或说「把xx改到第N天」");
      return;
    }
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    setAdjPreview(null);

    const hasItems = days.some((d) => d.items.length > 0);
    if (images.length === 0 && hasItems && looksLikeAdjust(text)) {
      const res = await proposeAdjust(tripId, text.trim());
      if (!isErr(res) && res.data.ops.length > 0) {
        setBusy(false);
        setAdjPreview(res.data);
        return;
      }
      if (!isErr(res) && res.data.ops.length === 0 && looksLikeAdjust(text)) {
        setBusy(false);
        setError(res.data.summary || "没识别到可执行的调整");
        return;
      }
    }

    const res = await extractPois(
      text,
      undefined,
      "all",
      images.map((img) => ({ mime: img.mime, data: img.data })),
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    if (res.data.places.length === 0) {
      setError("没识别到地点。可粘贴笔记 / 点评、上传截图，或直接改行程（如「把熊猫基地改到第2天」）");
      return;
    }
    setCands(res.data.places);
    setExtractSource(res.data.source);
    setSelected(new Set(res.data.places.map((_, i) => i)));
    setStep("picks");
  }

  async function onPickFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    setError(null);
    const room = 3 - images.length;
    if (room <= 0) {
      setError("最多 3 张图片");
      return;
    }
    const list = Array.from(files as ArrayLike<File>).slice(0, room);
    const next: LocalImage[] = [];
    for (const file of list) {
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
          id: `${Date.now()}-${file.name || "paste"}`,
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

  function onPasteBox(e: ClipboardEvent<HTMLTextAreaElement>) {
    const cd = e.clipboardData;
    if (!cd) return;
    const fromItems: File[] = [];
    for (const item of Array.from(cd.items)) {
      if (!item.type.startsWith("image/")) continue;
      const f = item.getAsFile();
      if (f) fromItems.push(f);
    }
    const fromFiles = Array.from(cd.files ?? []).filter((f) => f.type.startsWith("image/"));
    const imgs = fromItems.length ? fromItems : fromFiles;
    if (!imgs.length) return;
    e.preventDefault();
    void onPickFiles(imgs);
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
    const res = await planItinerary(tripId, pois, text);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setDraft(res.data);
    setStep("draft");
  }

  async function onCommit() {
    if (draft.some((d) => d.items.some((it) => !it.name.trim()))) {
      setError("地点名称不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    const cleaned = draft.map((d) => ({
      ...d,
      items: d.items.map((it) => ({
        ...it,
        name: it.name.trim(),
        startTime: it.startTime?.trim() || undefined,
      })),
    }));
    const res = await commitPlan(tripId, cleaned);
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

  async function onToPending() {
    if (draft.some((d) => d.items.some((it) => !it.name.trim()))) {
      setError("地点名称不能为空");
      return;
    }
    const places = draft.flatMap((d, di) =>
      d.items.map((it) => ({
        name: it.name.trim(),
        startTime: it.startTime?.trim() || null,
        dayLabel: `第${di + 1}天 · ${d.date.slice(5, 10)}`,
        amapId: it.amapId ?? null,
        lng: it.lng ?? null,
        lat: it.lat ?? null,
        category: it.category ?? null,
      })),
    );
    if (places.length === 0) {
      setError("草稿里没有地点");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await appendPending(tripId, places);
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    setPendingList(res.data);
    setPendingOpen(true);
    setDoneMsg(`已放入待定 ${places.length} 处（未写入行程）`);
    setStep("paste");
    setText("");
    setImages([]);
    setCands([]);
    setDraft([]);
  }

  async function removePending(id: string) {
    const next = pending.filter((p) => p.id !== id);
    setPendingList(next);
    const res = await setPending(tripId, next);
    if (isErr(res)) {
      setError(res.message);
      void getPending(tripId).then((r) => {
        if (!isErr(r)) setPendingList(r.data);
      });
    } else {
      setPendingList(res.data);
    }
  }

  function openJoinSheet(p: PendingPlace) {
    if (!days.length) {
      setError("没有可用行程日");
      return;
    }
    setError(null);
    setJoinTarget(p);
    setJoinDayId(resolveDayId(p, days) ?? days[0]!.id);
  }

  function closeJoinSheet() {
    setJoinTarget(null);
  }

  async function confirmJoin() {
    const p = joinTarget;
    if (!p || !joinDayId) return;
    setBusy(true);
    setError(null);
    const hasGeo = p.lng != null && p.lat != null && Number.isFinite(p.lng) && Number.isFinite(p.lat);
    const res = await addItem(
      joinDayId,
      {
        ...(hasGeo
          ? {
              poi: {
                name: p.name,
                lng: p.lng!,
                lat: p.lat!,
                amapId: p.amapId ?? undefined,
                category: p.category ?? undefined,
              },
            }
          : { customName: p.name }),
      },
      writeOpts,
    );
    setBusy(false);
    if (isErr(res)) {
      setError(res.message);
      return;
    }
    onDayChange?.(res.data);
    closeJoinSheet();
    await removePending(p.id);
    setDoneMsg(`已加入行程：${p.name}`);
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

  function patchDraftItem(dayIdx: number, itemIdx: number, patch: Partial<DraftItem>) {
    setDraft((prev) =>
      prev.map((d, di) =>
        di !== dayIdx
          ? d
          : {
              ...d,
              items: d.items.map((it, ii) => (ii !== itemIdx ? it : { ...it, ...patch })),
            },
      ),
    );
  }

  function removeDraftItem(dayIdx: number, itemIdx: number) {
    setDraft((prev) =>
      prev.map((d, di) =>
        di !== dayIdx ? d : { ...d, items: d.items.filter((_, ii) => ii !== itemIdx) },
      ),
    );
  }

  function moveDraftItem(dayIdx: number, itemIdx: number, dir: -1 | 1) {
    setDraft((prev) =>
      prev.map((d, di) => {
        if (di !== dayIdx) return d;
        const j = itemIdx + dir;
        if (j < 0 || j >= d.items.length) return d;
        const items = [...d.items];
        const tmp = items[itemIdx]!;
        items[itemIdx] = items[j]!;
        items[j] = tmp;
        return { ...d, items };
      }),
    );
  }

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-sm font-semibold">AI 助手</p>
      <p className="mb-3 text-xs text-ink-muted">提取攻略地点，或直接说「把xx改到第N天」</p>

      {joinTarget ? (
        <Sheet open onClose={closeJoinSheet} aria-label="加入行程">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-semibold">加入行程</p>
              <p className="truncate text-sm text-ink-muted">{joinTarget.name}</p>
            </div>
            <button
              type="button"
              className="h-11 w-11 text-lg text-ink-muted"
              onClick={closeJoinSheet}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <label className="mb-3 block text-xs text-ink-muted">
            加入哪一天
            <select
              className="mt-1 h-11 w-full appearance-none rounded-btn bg-surface-2 bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pl-3 pr-9 text-sm text-accent-dark outline-none"
              style={{ backgroundImage: SELECT_ARROW }}
              value={joinDayId}
              onChange={(e) => setJoinDayId(e.target.value)}
            >
              {days.map((d, i) => (
                <option key={d.id} value={d.id}>
                  {dayOptionLabel(d, i)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={closeJoinSheet}>
              取消
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !joinDayId}
              onClick={() => void confirmJoin()}
            >
              {busy ? "加入中…" : "确认加入"}
            </Button>
          </div>
        </Sheet>
      ) : null}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {doneMsg && <p className="mb-3 text-sm text-ok">{doneMsg}</p>}

      {step === "paste" && (
        <>
          <textarea
            className="min-h-[120px] w-full rounded-btn bg-surface-2 p-3 text-sm outline-none"
            placeholder={
              "粘贴笔记 / 点评，Ctrl+V 贴图\n或：把熊猫基地改到第2天"
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (adjPreview) setAdjPreview(null);
            }}
            onPaste={onPasteBox}
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
            <ul className="mt-3 flex flex-wrap gap-3 pt-1">
              {images.map((img) => (
                <li key={img.id} className="relative h-16 w-16 shrink-0">
                  <div className="h-full w-full overflow-hidden rounded-btn border border-line bg-surface-2">
                    <img src={img.preview} alt="" className="h-full w-full object-cover" />
                  </div>
                  <button
                    type="button"
                    className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-accent-dark text-sm leading-none text-white shadow-warm"
                    aria-label="删除图片"
                    onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {adjPreview && adjPreview.ops.length > 0 ? (
            <div className="mt-3 rounded-btn border border-line bg-surface px-3 py-2 text-xs">
              <p className="text-ink">{adjPreview.summary}</p>
              <p className="mt-0.5 text-ink-muted">
                {adjPreview.source === "llm" ? "AI" : "规则"} · 确认后写入行程
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 text-sm"
                  disabled={busy}
                  onClick={() => setAdjPreview(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="flex-1 text-sm"
                  disabled={busy}
                  onClick={() => void onApplyAdjust()}
                >
                  {busy ? "应用中…" : "确认应用"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 text-sm"
                disabled={busy || images.length >= 3}
                onClick={() => fileRef.current?.click()}
              >
                {images.length >= 3 ? "已满 3 张" : "图片"}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy || (!text.trim() && images.length === 0)}
                onClick={() => void onSend()}
              >
                {busy ? "处理中…" : "发送"}
              </Button>
            </div>
          )}

          {pending.length > 0 ? (
            <div className="mt-4 rounded-card border border-line bg-surface px-3 py-2 shadow-warm">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 py-1 text-left text-[11px] font-medium text-info"
                onClick={() => setPendingOpen((v) => !v)}
                aria-expanded={pendingOpen}
              >
                <span className="min-w-0 flex-1 truncate">待定 · {pending.length}</span>
                <span className="shrink-0 font-normal text-ink-muted">
                  {pendingOpen ? "收起" : "展开"}
                </span>
              </button>
              {pendingOpen ? (
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto border-t border-line pt-2 scroll-warm">
                  {pending.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.name}</span>
                      {p.dayLabel ? (
                        <span className="max-w-[4.5rem] shrink-0 truncate text-[10px] text-ink-muted">
                          {p.dayLabel}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        className="h-8 shrink-0 rounded-full bg-accent px-2.5 text-[11px] font-medium text-accent-dark disabled:opacity-50"
                        onClick={() => openJoinSheet(p)}
                      >
                        加入
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center text-danger"
                        aria-label="移出待定"
                        onClick={() => void removePending(p.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {step === "picks" && (
        <>
          {extractSource === "rules" && (
            <p className="mb-2 text-xs text-ink-muted">已用规则解析（无 LLM），请核对</p>
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
          <p className="mb-3 text-xs text-ink-muted">
            可改名称。推荐先「放入待定」作攻略参考；确定后再「写入行程」。
          </p>
          <div className="space-y-4">
            {draft.map((d, di) => (
              <div key={d.dayId}>
                <p className="mb-1 text-sm font-semibold">
                  第 {di + 1} 天 · {d.date.slice(5, 10)}
                </p>
                {d.items.length === 0 ? (
                  <p className="text-xs text-ink-muted">空</p>
                ) : (
                  <ul className="space-y-2">
                    {d.items.map((it, ii) => (
                      <li
                        key={`${d.dayId}-${ii}`}
                        className="flex items-center gap-1.5 rounded-btn bg-surface-2/80 p-2"
                      >
                        <input
                          type="text"
                          aria-label="地点名称"
                          className="h-10 min-w-0 flex-1 rounded-btn bg-bg px-2 text-sm outline-none"
                          value={it.name}
                          onChange={(e) => patchDraftItem(di, ii, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          className="flex h-10 w-8 shrink-0 items-center justify-center text-accent-dark disabled:opacity-30"
                          disabled={ii === 0}
                          aria-label="上移"
                          onClick={() => moveDraftItem(di, ii, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="flex h-10 w-8 shrink-0 items-center justify-center text-accent-dark disabled:opacity-30"
                          disabled={ii === d.items.length - 1}
                          aria-label="下移"
                          onClick={() => moveDraftItem(di, ii, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="flex h-10 w-8 shrink-0 items-center justify-center text-danger"
                          aria-label="删除"
                          onClick={() => removeDraftItem(di, ii)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("picks")}>
                上一步
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy || draft.every((d) => d.items.length === 0)}
                onClick={() => void onToPending()}
              >
                {busy ? "保存中…" : "放入待定"}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full text-sm"
              disabled={busy || draft.every((d) => d.items.length === 0)}
              onClick={() => void onCommit()}
            >
              {busy ? "写入中…" : "直接写入行程"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
