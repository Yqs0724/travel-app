import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Slot = { id: string; close: () => void };

type OverlayApi = {
  claim: (id: string, close: () => void) => void;
  release: (id: string) => void;
};

const OverlayCtx = createContext<OverlayApi | null>(null);

/** 阻断层互斥：同时只开一个 Sheet，新开则关掉旧的 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const slot = useRef<Slot | null>(null);
  const api = useRef<OverlayApi>({
    claim(id, close) {
      const prev = slot.current;
      slot.current = { id, close };
      if (prev && prev.id !== id) prev.close();
    },
    release(id) {
      if (slot.current?.id === id) slot.current = null;
    },
  }).current;

  return <OverlayCtx.Provider value={api}>{children}</OverlayCtx.Provider>;
}

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  "aria-label"?: string;
  variant?: "sheet" | "lightbox";
  dismissOnScrim?: boolean;
  className?: string;
};

export function Sheet({
  open,
  onClose,
  children,
  "aria-label": ariaLabel,
  variant = "sheet",
  dismissOnScrim = true,
  className = "",
}: SheetProps) {
  const id = useId();
  const host = useContext(OverlayCtx);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !host) return;
    const close = () => onCloseRef.current();
    host.claim(id, close);
    return () => host.release(id);
  }, [open, id, host]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  // 类名写死完整串，避免 Tailwind JIT 扫不到动态 z-* / 新 token
  const isLightbox = variant === "lightbox";

  return createPortal(
    <div
      className={
        isLightbox
          ? "fixed inset-0 z-[60] flex items-center justify-center px-4"
          : "fixed inset-0 z-[50] flex items-end justify-center sm:items-center sm:px-4"
      }
      style={{ backgroundColor: "var(--scrim)" }}
      onClick={dismissOnScrim ? () => onCloseRef.current() : undefined}
      role="presentation"
    >
      <div
        className={
          isLightbox
            ? `max-h-[90vh] max-w-[min(100%,480px)] p-2 ${className}`
            : `max-h-[min(85dvh,85vh)] w-full max-w-[480px] overflow-y-auto rounded-t-[20px] bg-bg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-warm sm:rounded-card ${className}`
        }
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
