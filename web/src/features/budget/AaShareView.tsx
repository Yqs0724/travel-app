import { useMemo, useState } from "react";
import type { AaShareSnapshot } from "@/api/share";
import { Button } from "@/components/Button";
import { AaTicket } from "./AaTicket";
import { aaExportFilename, downloadAaHtml, exportAaBundle, filterAaSnap, printAaHtml } from "./aaExport";

export function AaShareView({
  snap,
  forFriend,
}: {
  snap: AaShareSnapshot;
  /** 发给谁：只筛她参与的共同账，小票不出现名字 */
  forFriend?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const view = useMemo(
    () => (forFriend ? filterAaSnap(snap, forFriend) : snap),
    [snap, forFriend],
  );

  function onDownloadHtml() {
    setBusy(true);
    setErr(null);
    try {
      downloadAaHtml(aaExportFilename(view), exportAaBundle(view));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "导出失败");
    }
    setBusy(false);
  }

  function onPrintPdf() {
    setBusy(true);
    setErr(null);
    try {
      printAaHtml(exportAaBundle(view));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "打印失败");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-dvh bg-[#e8eee6] px-4 pb-12 pt-6">
      <AaTicket snap={view} />
      <div className="mx-auto mt-8 flex max-w-[340px] gap-2">
        <Button type="button" className="flex-1" disabled={busy} onClick={onDownloadHtml}>
          下载 HTML
        </Button>
        <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={onPrintPdf}>
          打印 / 存 PDF
        </Button>
      </div>
      {err && <p className="mt-2 text-center text-sm text-danger">{err}</p>}
      <p className="mt-1 text-center text-[11px] text-[#8a8a8a]">PDF 在打印框里选「另存为 PDF」</p>
    </div>
  );
}
