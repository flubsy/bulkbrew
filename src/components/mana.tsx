"use client";

import type { Color } from "@/lib/types";

/**
 * Pixel mana symbols. 9×9 grids, one char per pixel.
 * W sun · U drop · B skull · R flame · G tree · C diamond · generic = number.
 */
const W = ["....c....", ".c..c..c.", "..ccccc..", "..cgggc..", "cccgggccc", "..cgggc..", "..ccccc..", ".c..c..c.", "....c...."];
const U = ["....b....", "....b....", "...bbb...", "..bbbbb..", ".bbbbbbb.", ".bbwbbbb.", ".bbwbbbb.", "..bbbbb..", "...bbb..."];
const B = ["..ccccc..", ".ccccccc.", "ccccccccc", "cc#ccc#cc", "cc#ccc#cc", "ccccccccc", ".cc###cc.", "..c#c#c..", "..ccccc.."];
const R = ["....o....", "...oo....", "..ooo.o..", "..oooooo.", ".oooyooo.", ".ooyyyoo.", ".ooyyyoo.", "..oyyyo..", "...ooo..."];
const G = ["....g....", "...ggg...", "..ggggg..", ".ggggggg.", "..ggggg..", ".ggggggg.", "ggggggggg", "....t....", "....t...."];
const C = ["....m....", "...mmm...", "..mmmmm..", ".mmmmmmm.", "mmmmmmmmm", ".mmmmmmm.", "..mmmmm..", "...mmm...", "....m...."];

const FILL: Record<string, string> = {
  c: "#f3e9d2",
  g: "#e9c67c",
  b: "#5aa0e6",
  w: "#dff1ff",
  "#": "#0b1324",
  o: "#ff5a2c",
  y: "#ffd27a",
  t: "#8a5a2b",
  m: "#9aa6c2",
};
const BG: Record<string, string> = { W: "#4a4634", U: "#17345e", B: "#2a2433", R: "#5a1f10", G: "#1d4228", C: "#2b2f3a" };
const GRID: Record<string, string[]> = { W, U, B, R, G, C };

function Glyph({ grid, size }: { grid: string[]; size: number }) {
  const rects: { x: number; y: number; f: string }[] = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && FILL[ch] && rects.push({ x, y, f: FILL[ch] })));
  return (
    <svg viewBox="0 0 9 9" width={size} height={size} shapeRendering="crispEdges" aria-hidden>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1} height={1} fill={r.f} />
      ))}
    </svg>
  );
}

/** One mana symbol. `sym` is the inside of the braces: W, U, 2, X, W/U, 2/B, S, C… */
export function ManaSymbol({ sym, size = 16 }: { sym: string; size?: number }) {
  const s = sym.toUpperCase();
  const parts = s.split("/");
  const colored = parts.filter((p) => p in GRID);
  if (colored.length === 1 && parts.length === 1) {
    return (
      <span className="inline-flex items-center justify-center" style={{ width: size, height: size, background: BG[s] }} title={s}>
        <Glyph grid={GRID[s]} size={size - 2} />
      </span>
    );
  }
  if (colored.length >= 1 && parts.length > 1) {
    // Hybrid / phyrexian: split background, show first glyph.
    const [a, b] = parts;
    const bgA = BG[a] ?? "#2b2f3a";
    const bgB = BG[b] ?? "#2b2f3a";
    return (
      <span className="inline-flex items-center justify-center" style={{ width: size, height: size, background: `linear-gradient(135deg, ${bgA} 50%, ${bgB} 50%)` }} title={s}>
        <Glyph grid={GRID[colored[0]]} size={size - 2} />
      </span>
    );
  }
  // Generic / X / snow
  return (
    <span className="inline-flex items-center justify-center font-pixel text-[8px] text-cream" style={{ width: size, height: size, background: "#2b2f3a" }} title={s}>
      {s === "S" ? "❄" : s}
    </span>
  );
}

export function ManaCost({ cost, size = 16 }: { cost: string; size?: number }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!symbols.length) return null;
  return (
    <span className="inline-flex gap-[2px] align-middle">
      {symbols.map((s, i) => (
        <ManaSymbol key={i} sym={s} size={size} />
      ))}
    </span>
  );
}

/** Colour identity as a row of pixel symbols, with the guild/shard/wedge name on hover. */
export function ColorIdentity({ ci, size = 16, label }: { ci: readonly string[]; size?: number; label?: string }) {
  const list = ci.length ? [...ci] : ["C"];
  return (
    <span className="inline-flex gap-[2px] align-middle" title={label}>
      {list.map((c) => (
        <ManaSymbol key={c} sym={c} size={size} />
      ))}
    </span>
  );
}

export const COLOR_LIST: Color[] = ["W", "U", "B", "R", "G"];
