import { CATEGORY_LABELS, yuan } from "@/api/budget";
import type { AaShareSnapshot } from "@/api/share";

const ME = "我";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function itemLabel(exp: AaShareSnapshot["expenses"][number]) {
  const cat = CATEGORY_LABELS[exp.category] ?? exp.category;
  return (exp.note?.trim() || cat).trim();
}

export function formatTripRange(start: string, end: string) {
  const a = start.slice(0, 10).replace(/-/g, ".");
  const b = end.slice(0, 10).replace(/-/g, ".");
  return a === b ? a : `${a} — ${b}`;
}

export function friendsOnAa(snap: AaShareSnapshot): string[] {
  const set = new Set<string>();
  for (const e of snap.expenses) {
    for (const s of e.splits) {
      const m = s.member.trim();
      if (m && m !== ME) set.add(m);
    }
  }
  return [...set];
}

function memberShare(amount: number, splits: Array<{ member: string; ratio: number }>, name: string) {
  const ratioSum = splits.reduce((s, x) => s + x.ratio, 0);
  if (ratioSum <= 0) return 0;
  const r = splits.find((s) => s.member === name)?.ratio ?? 0;
  return (amount * r) / ratioSum;
}

/** 该笔是否恰好两人均摊（可展示五折） */
export function isHalfOffExpense(exp: AaShareSnapshot["expenses"][number]) {
  const names = [...new Set(exp.splits.map((s) => s.member.trim()).filter(Boolean))];
  return names.length === 2;
}

export function filterAaSnap(snap: AaShareSnapshot, friend: string): AaShareSnapshot {
  const expenses = snap.expenses.filter((e) => e.splits.some((s) => s.member.trim() === friend));
  let total = 0;
  let friendShare = 0;
  for (const e of expenses) {
    total += e.amount;
    friendShare += memberShare(e.amount, e.splits, friend);
  }
  total = Math.round(total * 100) / 100;
  friendShare = Math.round(friendShare * 100) / 100;
  return {
    ...snap,
    expenses,
    totalShared: total,
    myShare: Math.round((total - friendShare) * 100) / 100,
    othersOweMe: friendShare,
    transfers:
      friendShare > 0.009 ? [{ from: friend, to: ME, amount: friendShare }] : [],
  };
}

export function showHalfOff(snap: AaShareSnapshot) {
  return snap.expenses.length > 0 && snap.expenses.every(isHalfOffExpense);
}

const TICKET_CSS = `
  body { margin: 0; background: #e8eee6; color: #749469;
    font: 15px/1.5 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .page { min-height: 100vh; padding: 24px 16px 40px; }
  .ticket { max-width: 360px; margin: 0 auto; background: #F7F7F7; position: relative;
    box-shadow: 0 10px 28px rgba(84,128,70,0.12);
    clip-path: polygon(0 0,100% 0,100% calc(100% - 10px),97% 100%,94% calc(100% - 10px),91% 100%,88% calc(100% - 10px),85% 100%,82% calc(100% - 10px),79% 100%,76% calc(100% - 10px),73% 100%,70% calc(100% - 10px),67% 100%,64% calc(100% - 10px),61% 100%,58% calc(100% - 10px),55% 100%,52% calc(100% - 10px),49% 100%,46% calc(100% - 10px),43% 100%,40% calc(100% - 10px),37% 100%,34% calc(100% - 10px),31% 100%,28% calc(100% - 10px),25% 100%,22% calc(100% - 10px),19% 100%,16% calc(100% - 10px),13% 100%,10% calc(100% - 10px),7% 100%,4% calc(100% - 10px),0 100%); }
  .frame { position: absolute; inset: 8px 8px 14px; border: 1px solid #D1DECD; pointer-events: none; }
  .pad { position: relative; padding: 28px 28px 40px; }
  .welcome { display: flex; align-items: center; justify-content: center; gap: 8px; color: #548046;
    font-size: 11px; letter-spacing: 0.28em; }
  .paw { width: 14px; height: 14px; fill: #548046; flex-shrink: 0; }
  h1 { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.2em; margin: 8px 0 0; color: #548046; }
  .kind { text-align: center; font-size: 11px; letter-spacing: 0.22em; color: #749469; margin: 4px 0 0; }
  .rule { border: 0; border-top: 1px solid #D1DECD; margin: 16px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; }
  .meta .k { color: #BEC0BC; }
  .meta .v { color: #749469; font-variant-numeric: tabular-nums; }
  .sec { font-size: 12px; letter-spacing: 0.2em; color: #548046; margin: 0 0 6px; }
  .item { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 6px 0; font-size: 14px; }
  .item .name { color: #BEC0BC; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .amt { color: #749469; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; margin-top: 4px; }
  .sub .k { color: #BEC0BC; }
  .half { position: relative; display: inline-block; color: #749469; font-variant-numeric: tabular-nums; }
  .half .num { position: relative; display: inline-block; padding: 0 2px; }
  .half .slash { position: absolute; left: 0; right: 0; top: 50%; height: 1.5px; background: #D1DECD;
    transform: rotate(35deg); transform-origin: center; pointer-events: none; }
  .half .pct { margin-left: 2px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
    color: #548046; vertical-align: super; line-height: 1; }
  .due { display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; }
  .due .lbl { font-size: 15px; font-weight: 600; letter-spacing: 0.08em; color: #548046; }
  .due .amt { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: #548046; font-variant-numeric: tabular-nums; }
  .thanks { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px;
    font-size: 11px; letter-spacing: 0.28em; color: #548046; }
  .bye { text-align: center; font-size: 10px; letter-spacing: 0.22em; color: #749469; margin: 6px 0 0; }
  .empty { text-align: center; color: #BEC0BC; padding: 12px 0; }
  @media print { body { background: #fff; } .page { padding: 0; } .ticket { box-shadow: none; } }
`;

function dateCn(iso: string) {
  const d = iso.slice(0, 10);
  return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
}

const PAW_CAT = `<svg class="paw" viewBox="0 0 24 24"><circle cx="6.5" cy="6" r="2.1"/><circle cx="12" cy="4.2" r="2.1"/><circle cx="17.5" cy="6" r="2.1"/><circle cx="4.8" cy="11.2" r="1.9"/><circle cx="19.2" cy="11.2" r="1.9"/><ellipse cx="12" cy="15.5" rx="5.2" ry="4.2"/></svg>`;
const PAW_DOG = `<svg class="paw" viewBox="0 0 24 24"><ellipse cx="7" cy="7" rx="2.2" ry="2.8"/><ellipse cx="17" cy="7" rx="2.2" ry="2.8"/><ellipse cx="4.5" cy="13" rx="2" ry="2.4"/><ellipse cx="19.5" cy="13" rx="2" ry="2.4"/><path d="M12 10c-3.2 0-5.5 2.4-5.5 5.2 0 2.2 1.6 3.8 5.5 3.8s5.5-1.6 5.5-3.8C17.5 12.4 15.2 10 12 10z"/></svg>`;

/** 小票 HTML：无姓名、无附图 */
export function buildAaExportHtml(snap: AaShareSnapshot): string {
  const half = showHalfOff(snap);
  const range = `${dateCn(String(snap.trip.startDate))} — ${dateCn(String(snap.trip.endDate))}`;
  const title = escapeHtml(snap.trip.title);

  const rows = snap.expenses
    .map(
      (exp) =>
        `<div class="item"><span class="name">${escapeHtml(itemLabel(exp))}</span><span class="amt">${yuan(exp.amount)}</span></div>`,
    )
    .join("\n");

  const sumRight = half
    ? `<span class="half"><span class="num">${yuan(snap.totalShared)}<span class="slash"></span></span><sup class="pct">50%</sup></span>`
    : `<span class="v" style="color:#749469;font-variant-numeric:tabular-nums">${yuan(snap.totalShared)}</span>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>${TICKET_CSS}</style>
</head>
<body>
<div class="page">
<main class="ticket">
  <div class="frame"></div>
  <div class="pad">
    <div class="welcome">${PAW_CAT}<span>WELCOME</span>${PAW_CAT}</div>
    <h1>${title}</h1>
    <p class="kind">AA 结算单</p>
    <hr class="rule"/>
    <div class="meta"><span class="k">日期</span><span class="v">${escapeHtml(range)}</span></div>
    <div class="meta"><span class="k">人数</span><span class="v">2 人</span></div>
    <div class="meta"><span class="k">笔数</span><span class="v">${snap.expenses.length}</span></div>
    <hr class="rule"/>
    <p class="sec">项目</p>
    ${rows || `<p class="empty">暂无共同支出</p>`}
    <hr class="rule"/>
    <div class="sub"><span class="k">小计</span>${sumRight}</div>
    <div class="due"><span class="lbl">应付</span><span class="amt">${yuan(snap.othersOweMe)}</span></div>
    <div class="thanks">${PAW_DOG}<span>THANK YOU</span>${PAW_DOG}</div>
    <p class="bye">欢迎下次光临</p>
  </div>
</main>
</div>
</body>
</html>`;
}

export function downloadAaHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printAaHtml(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("浏览器拦截了弹窗，请允许后重试");
  }
  const revoke = () => URL.revokeObjectURL(url);
  w.addEventListener("load", () => {
    w.focus();
    w.print();
    // ponytail: 打印后延迟释放；升级可改 iframe 内打印
    window.setTimeout(revoke, 60_000);
  });
}

export function exportAaBundle(snap: AaShareSnapshot): string {
  return buildAaExportHtml(snap);
}

export function aaExportFilename(snap: AaShareSnapshot) {
  const safe = snap.trip.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  return `${safe || "行程"}-共同支出.html`;
}
