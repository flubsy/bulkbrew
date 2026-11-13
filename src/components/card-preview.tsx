"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  // Docked to the side of the screen away from the pointer: no mouse tracking, so hovering a row
  // costs one small render of the dock, not a re-render of the page.
  const [hover, setHover] = useState<{ url: string; name: string; side: "left" | "right" } | null>(null);
  const [modal, setModal] = useState<{ url: string; name: string } | null>(null);
  const touch = useRef(false);

  useEffect(() => {
    touch.current = window.matchMedia("(hover: none)").matches;
  }, []);

  const show = useCallback<Ctx["show"]>((url, name, e) => {
    if (!url || touch.current) return;
    const side = (e?.clientX ?? 0) > window.innerWidth * 0.55 ? "left" : "right";
    setHover((h) => (h?.url === url && h.side === side ? h : { url, name, side }));
  }, []);
  const hide = useCallback(() => setHover(null), []);
  const open = useCallback<Ctx["open"]>((url, name) => url && setModal({ url, name }), []);
  const value = useMemo(() => ({ show, hide, open }), [show, hide, open]);

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {hover && (
        <div className="card-preview px-border" style={hover.side === "right" ? { right: 16 } : { left: 16 }} aria-hidden>
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
