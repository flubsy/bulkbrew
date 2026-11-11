"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Hover (desktop) / tap (mobile) card image preview.
 * Wrap a page in <CardPreviewProvider>; call `show(url, name)` on hover and `hide()` on leave.
 * On touch devices the preview becomes a tap-to-open overlay instead.
 */

interface Ctx {
  show: (url: string | undefined, name: string, e?: { clientX: number; clientY: number }) => void;
  hide: () => void;
  open: (url: string | undefined, name: string) => void;
}

const PreviewContext = createContext<Ctx>({ show: () => {}, hide: () => {}, open: () => {} });

export function useCardPreview() {
  return useContext(PreviewContext);
}

export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<{ url: string; name: string; x: number; y: number } | null>(null);
  const [modal, setModal] = useState<{ url: string; name: string } | null>(null);
  const touch = useRef(false);

  useEffect(() => {
    touch.current = window.matchMedia("(hover: none)").matches;
  }, []);

  const show = useCallback<Ctx["show"]>((url, name, e) => {
    if (!url || touch.current) return;
    setHover({ url, name, x: e?.clientX ?? 0, y: e?.clientY ?? 0 });
  }, []);
  const hide = useCallback(() => setHover(null), []);
  const open = useCallback<Ctx["open"]>((url, name) => url && setModal({ url, name }), []);

  useEffect(() => {
    if (!hover) return;
    const move = (e: MouseEvent) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [hover]);

  // Keep the preview on screen.
  let left = 0;
  let top = 0;
  if (hover && typeof window !== "undefined") {
    const w = 244;
    const h = 340;
    left = hover.x + 20 + w > window.innerWidth ? hover.x - w - 20 : hover.x + 20;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, hover.y - h / 2));
  }

  return (
    <PreviewContext.Provider value={{ show, hide, open }}>
      {children}
      {hover && (
        <div className="card-preview px-border" style={{ left, top }} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hover.url} alt="" width={244} height={340} />
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-900/90 p-6" role="dialog" aria-label={modal.name} onClick={() => setModal(null)}>
          <div className="px-border px-border-orange bg-navy-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modal.url} alt={modal.name} className="max-h-[80vh] w-auto" style={{ imageRendering: "auto" }} />
          </div>
        </div>
      )}
    </PreviewContext.Provider>
  );
}

/** Props to spread on any element that should preview a card. */
export function previewProps(ctx: Ctx, url: string | undefined, name: string) {
  return {
    onMouseEnter: (e: React.MouseEvent) => ctx.show(url, name, e),
    onMouseLeave: ctx.hide,
    onClick: () => ctx.open(url, name),
  };
}
