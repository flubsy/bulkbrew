"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

const W = 244;
const H = 340;

/** Where the preview goes for a pointer at (x, y): beside the cursor, flipped and clamped to stay on screen. */
function spot(x: number, y: number) {
  const left = x + 20 + W > window.innerWidth ? x - W - 20 : x + 20;
  const top = Math.max(8, Math.min(window.innerHeight - H - 8, y - H / 2));
  return `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

export function CardPreviewProvider({ children }: { children: ReactNode }) {
  // Follows the cursor, but the position is written straight to the element once per frame:
  // React only re-renders when the card changes, never on mouse movement.
  const [hover, setHover] = useState<{ url: string; name: string } | null>(null);
  const [modal, setModal] = useState<{ url: string; name: string } | null>(null);
  const touch = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const point = useRef({ x: 0, y: 0 });

  useEffect(() => {
    touch.current = window.matchMedia("(hover: none)").matches;
  }, []);

  const show = useCallback<Ctx["show"]>((url, name, e) => {
    if (!url || touch.current) return;
    point.current = { x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
    if (box.current) box.current.style.transform = spot(point.current.x, point.current.y);
    setHover((h) => (h?.url === url ? h : { url, name }));
  }, []);
  const hide = useCallback(() => setHover(null), []);
  const open = useCallback<Ctx["open"]>((url, name) => url && setModal({ url, name }), []);
  const value = useMemo(() => ({ show, hide, open }), [show, hide, open]);

  // Place it before paint when it appears, then track the pointer while it's shown.
  useLayoutEffect(() => {
    if (hover && box.current) box.current.style.transform = spot(point.current.x, point.current.y);
  }, [hover]);
  useEffect(() => {
    if (!hover) return;
    let frame = 0;
    const move = (e: MouseEvent) => {
      point.current = { x: e.clientX, y: e.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (box.current) box.current.style.transform = spot(point.current.x, point.current.y);
      });
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => { window.removeEventListener("mousemove", move); if (frame) cancelAnimationFrame(frame); };
  }, [hover]);

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {hover && (
        <div ref={box} className="card-preview px-border" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hover.url} alt="" width={W} height={H} />
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
