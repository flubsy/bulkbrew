"use client";

import { useEffect, useRef } from "react";
import { createBrewScene, FOCUS_X, SCENE_H, SCENE_W } from "./brew-scene";

/**
 * Runs the brew scene at the art's own 10 fps and blows it up at the largest integer scale that
 * fits (never fractional, so every art pixel stays square). Narrow screens crop around the
 * cauldron instead of shrinking. Pauses off-screen and in background tabs; reduced motion gets
 * one still frame. `flare` makes the brew surge (used while a collection is dropped in).
 */
export function BrewCanvas({ flare = false, className = "" }: { flare?: boolean; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const flareRef = useRef(flare);

  useEffect(() => {
    flareRef.current = flare;
  }, [flare]);

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const scene = createBrewScene();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let k = 3, sx = 0, vw = SCENE_W;
    let frame = 14; // a frame with cards mid-air, used as the still for reduced motion
    let visible = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const layout = () => {
      const w = el.clientWidth;
      k = Math.max(2, Math.floor(w / SCENE_W));
      vw = Math.min(SCENE_W, Math.floor(w / k));
      sx = Math.max(0, Math.min(SCENE_W - vw, FOCUS_X - Math.floor(vw / 2)));
      cv.width = vw * k;
      cv.height = SCENE_H * k;
      cv.style.width = `${vw * k}px`;
      cv.style.height = `${SCENE_H * k}px`;
      paint();
    };
    const paint = () => scene.draw(frame, flareRef.current).present(ctx, k, sx, vw);
    const tick = () => { frame++; paint(); };
    const run = () => {
      if (reduce || timer || !visible || document.hidden) return;
      timer = setInterval(tick, 100);
    };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };

    const ro = new ResizeObserver(layout);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) run(); else stop(); });
    io.observe(el);
    const onVis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", onVis);
    layout();
    run();
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return (
    <div ref={wrap} className={`flex justify-center overflow-hidden ${className}`}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Pixel-art castle courtyard at night: cards fly out of an open binder into a bubbling cauldron over a fire, and a finished deck box floats up out of the brew."
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
