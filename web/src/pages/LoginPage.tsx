import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

const GOLD = "#FFBF53";

function Polaroid({
  src,
  label,
  className,
  rotate = "0deg",
  z = 1,
}: {
  src: string;
  label?: string;
  className?: string;
  rotate?: string;
  z?: number;
}) {
  return (
    <div
      className={`rounded-sm bg-white p-1 shadow-[2px_3px_10px_rgba(111,88,76,0.16)] ${className ?? ""}`}
      style={{ transform: `rotate(${rotate})`, zIndex: z }}
    >
      <img src={src} alt="" className="aspect-square w-full object-cover" />
      {label && (
        <p className="mt-1 text-center">
          <span className="login-img-tag">{label}</span>
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/trips" replace />;

  async function enter() {
    setLoading(true);
    setError(null);
    const err = await login();
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <div className="relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-[#FAF7F2]">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-3 bg-accent-dark" />

      <div
        className="pointer-events-none absolute inset-x-4 top-3 bottom-3 z-0 -rotate-[0.6deg] rounded-sm bg-[#F3EBD8] shadow-sm"
        aria-hidden
      />

      <div className="relative z-10 flex h-full flex-col pl-6 pr-3.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-5">
        {/* 刊头条 */}
        <div className="relative mb-2 flex items-center justify-between gap-2 px-1">
          <div>
            <p className="login-scrap-title text-[32px] leading-none text-accent-dark">国庆专刊</p>
            <p className="login-art-eyebrow mt-0.5 text-[10px] tracking-[0.28em] text-accent-dark/55">
              scrapbook · special issue
            </p>
          </div>
          <div
            className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border border-accent-dark/35 bg-transparent"
            aria-label="VOL.01"
          >
            <span className="text-[8px] font-medium leading-none tracking-[0.14em] text-accent-dark/55">
              VOL
            </span>
            <span className="mt-0.5 text-[12px] font-semibold leading-none tabular-nums text-accent-dark">
              01
            </span>
          </div>
        </div>

        {/* 上区：主图左 + 右侧叠放小图（整体略缩小，位置关系不变） */}
        {/* 上区：主图左略下移居中感；右侧三张位置保持原样 */}
        <div className="relative mx-auto flex min-h-0 w-[92%] flex-[1.05] items-start gap-1.5 px-0.5">
          <div className="relative mt-7 w-[56%] shrink-0">
            <div className="rounded-sm bg-white p-1.5 pb-2.5 shadow-[2px_4px_12px_rgba(111,88,76,0.14)] rotate-[-1.5deg]">
              <img src="/rose.jpg" alt="" className="aspect-square w-full object-cover" />
            </div>
            <span
              className="login-img-tag absolute -right-2 bottom-5 z-10 rotate-[8deg] shadow-sm"
            >
              COVER
            </span>
          </div>

          <div className="relative mt-1 h-full w-[44%] scale-[0.92] origin-top">
            <Polaroid
              src="/rich.jpg"
              label="有钱花"
              rotate="4deg"
              z={3}
              className="absolute left-0 top-0 w-[88%]"
            />
            <Polaroid
              src="/friends.jpg"
              label="好朋友"
              rotate="-6deg"
              z={4}
              className="absolute left-[8%] top-[32%] w-[90%]"
            />
            <Polaroid
              src="/date.jpg"
              label="约会"
              rotate="5deg"
              z={5}
              className="absolute left-[2%] top-[64%] w-[86%]"
            />
          </div>
        </div>

        {/* 中区：文案便签 */}
        <div className="relative z-10 mx-auto mt-2 w-[96%] shrink-0 -rotate-[0.4deg] bg-[#FFFCF7] px-3 py-2.5 shadow-[1px_2px_8px_rgba(111,88,76,0.1)]">
          <div
            className="pointer-events-none absolute -left-0.5 top-2 h-3.5 w-6 -rotate-12 opacity-70"
            style={{ background: `${GOLD}aa` }}
            aria-hidden
          />
          <p className="login-art-copy text-[15px] leading-[1.8]">
            为进一步深化双向了解，丰富情感联结的实践形式，建议依托线下场景展开一次友好互动，通过沉浸式交流磐实情感基础，推动彼此关系向更高质量更深层次发展。
          </p>
          {error && <p className="mt-1 text-center text-sm text-danger">{error}</p>}
        </div>

        {/* 底排：机翼 / 自拍1 / 自拍2 */}
        <div className="relative mx-auto mt-2 w-[90%] shrink-0 px-0.5">
          <div className="flex gap-1.5">
            <div className="flex-1">
              <div className="rounded-sm border-2 border-accent-dark/20 bg-white p-0.5">
                <img src="/wing.jpg" alt="" className="aspect-[3/4] w-full object-cover" />
              </div>
            </div>
            <div className="flex-1">
              <div className="rounded-sm border-2 border-accent-dark/20 bg-white p-0.5">
                <img src="/selfie1.jpg" alt="" className="aspect-[3/4] w-full object-cover" />
              </div>
            </div>
            <div className="flex-1">
              <div className="rounded-sm border-2 border-accent-dark/20 bg-white p-0.5">
                <img src="/selfie2.jpg" alt="" className="aspect-[3/4] w-full object-cover" />
              </div>
            </div>
          </div>

          <div className="absolute -bottom-1 left-2 z-10 h-12 w-12 overflow-hidden rounded-full border-[3px] border-white shadow-md rotate-[-8deg]">
            <img src="/money.jpg" alt="" className="h-full w-full object-cover" />
          </div>
        </div>

        {/* 附议：原贴纸样式，仅字体改仿宋 */}
        <div className="relative mt-3 shrink-0 px-1">
          <div className="absolute -top-1.5 left-5 h-2.5 w-12 rotate-[-6deg] bg-white/90 shadow-sm" aria-hidden />
          <button
            type="button"
            disabled={loading}
            onClick={() => void enter()}
            className="login-fuyi-btn relative flex h-11 w-full items-center justify-center gap-2 rounded-sm border-2 border-dashed border-accent-dark/25 bg-accent-dark text-[17px] tracking-[0.35em] text-[#FAF7F2] shadow-[2px_3px_0_rgba(201,164,148,0.4)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            {loading ? "…" : (
              <>
                附议
                <svg
                  className="ml-0.5 opacity-75"
                  width="20"
                  height="14"
                  viewBox="0 0 20 14"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M2 7h13.5M11.5 2.5 17 7l-5.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
