import { yuan } from "@/api/budget";
import type { AaShareSnapshot } from "@/api/share";
import { itemLabel, showHalfOff } from "./aaExport";

function dateCn(iso: string) {
  const d = iso.slice(0, 10);
  return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
}

/** 爪印装饰：猫爪 / 狗爪简化 SVG */
function Paw({ kind = "cat", className = "" }: { kind?: "cat" | "dog"; className?: string }) {
  if (kind === "dog") {
    return (
      <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
        <ellipse cx="7" cy="7" rx="2.2" ry="2.8" />
        <ellipse cx="17" cy="7" rx="2.2" ry="2.8" />
        <ellipse cx="4.5" cy="13" rx="2" ry="2.4" />
        <ellipse cx="19.5" cy="13" rx="2" ry="2.4" />
        <path d="M12 10c-3.2 0-5.5 2.4-5.5 5.2 0 2.2 1.6 3.8 5.5 3.8s5.5-1.6 5.5-3.8C17.5 12.4 15.2 10 12 10z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
      <circle cx="6.5" cy="6" r="2.1" />
      <circle cx="12" cy="4.2" r="2.1" />
      <circle cx="17.5" cy="6" r="2.1" />
      <circle cx="4.8" cy="11.2" r="1.9" />
      <circle cx="19.2" cy="11.2" r="1.9" />
      <ellipse cx="12" cy="15.5" rx="5.2" ry="4.2" />
    </svg>
  );
}

/** 小计：金额 \ 划掉，右上角 50% */
function HalfPrice({ amount }: { amount: number }) {
  return (
    <span className="relative inline-block tabular-nums text-[#749469]">
      <span className="relative inline-block px-0.5">
        {yuan(amount)}
        <span
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1.5px] origin-center bg-[#D1DECD]"
          style={{ transform: "rotate(35deg)" }}
          aria-hidden
        />
      </span>
      <sup className="ml-0.5 align-super text-[10px] font-semibold leading-none tracking-wide text-[#548046]">
        50%
      </sup>
    </span>
  );
}

export function AaTicket({ snap }: { snap: AaShareSnapshot }) {
  const half = showHalfOff(snap);
  const range = `${dateCn(String(snap.trip.startDate))} — ${dateCn(String(snap.trip.endDate))}`;

  return (
    <article
      className="relative mx-auto w-full max-w-[360px] overflow-hidden bg-[#F7F7F7] text-[#749469] shadow-[0_10px_28px_rgba(84,128,70,0.12)]"
      style={{
        clipPath:
          "polygon(0 0,100% 0,100% calc(100% - 10px),97% 100%,94% calc(100% - 10px),91% 100%,88% calc(100% - 10px),85% 100%,82% calc(100% - 10px),79% 100%,76% calc(100% - 10px),73% 100%,70% calc(100% - 10px),67% 100%,64% calc(100% - 10px),61% 100%,58% calc(100% - 10px),55% 100%,52% calc(100% - 10px),49% 100%,46% calc(100% - 10px),43% 100%,40% calc(100% - 10px),37% 100%,34% calc(100% - 10px),31% 100%,28% calc(100% - 10px),25% 100%,22% calc(100% - 10px),19% 100%,16% calc(100% - 10px),13% 100%,10% calc(100% - 10px),7% 100%,4% calc(100% - 10px),0 100%)",
      }}
    >
      {/* 单层边框 */}
      <div className="pointer-events-none absolute inset-[8px] bottom-[14px] border border-[#D1DECD]" />

      <div className="relative px-7 pb-10 pt-7">
        <div className="flex items-center justify-center gap-2 text-[#548046]">
          <Paw kind="cat" />
          <span className="text-[11px] tracking-[0.28em]">WELCOME</span>
          <Paw kind="cat" />
        </div>

        <h1 className="mt-2 text-center text-xl font-bold tracking-[0.2em] text-[#548046]">
          {snap.trip.title}
        </h1>
        <p className="mt-1 text-center text-[11px] tracking-[0.22em] text-[#749469]">AA 结算单</p>

        <hr className="my-4 border-0 border-t border-[#D1DECD]" />

        <div className="flex justify-between text-xs">
          <span className="text-[#BEC0BC]">日期</span>
          <span className="tabular-nums text-[#749469]">{range}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="text-[#BEC0BC]">人数</span>
          <span className="tabular-nums text-[#749469]">2 人</span>
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="text-[#BEC0BC]">笔数</span>
          <span className="tabular-nums text-[#749469]">{snap.expenses.length}</span>
        </div>

        <hr className="my-4 border-0 border-t border-[#D1DECD]" />

        <p className="text-xs tracking-[0.2em] text-[#548046]">项目</p>
        <ul className="mt-1.5">
          {snap.expenses.length === 0 ? (
            <li className="py-2 text-center text-sm text-[#BEC0BC]">暂无共同支出</li>
          ) : (
            snap.expenses.map((exp) => (
              <li key={exp.id} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="min-w-0 truncate text-[#BEC0BC]">{itemLabel(exp)}</span>
                <span className="shrink-0 tabular-nums text-[#749469]">{yuan(exp.amount)}</span>
              </li>
            ))
          )}
        </ul>

        <hr className="my-4 border-0 border-t border-[#D1DECD]" />

        <div className="flex items-baseline justify-between text-sm">
          <span className="text-[#BEC0BC]">小计</span>
          {half ? <HalfPrice amount={snap.totalShared} /> : (
            <span className="tabular-nums text-[#749469]">{yuan(snap.totalShared)}</span>
          )}
        </div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="text-[15px] font-semibold tracking-wide text-[#548046]">应付</span>
          <span className="text-2xl font-bold tabular-nums tracking-tight text-[#548046]">
            {yuan(snap.othersOweMe)}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[#548046]">
          <Paw kind="dog" />
          <p className="text-[11px] tracking-[0.28em]">THANK YOU</p>
          <Paw kind="dog" />
        </div>
        <p className="mt-1.5 text-center text-[10px] tracking-[0.22em] text-[#749469]">欢迎下次光临</p>
      </div>
    </article>
  );
}
