"use client";

import { memo, type ReactElement } from "react";
import type { Color } from "@/lib/types";

/**
 * Mana symbols in Magic's own visual language, drawn as pixel art: a coloured disc in the
 * official symbol colours, a black glyph (sun, drop, skull, fireball, tree, diamond), and the
 * printed symbol's dark drop shadow. Generic costs are a grey disc with a bold numeral.
 * Drawn on a 16×16 grid and shown at 16 or 32 px so every art pixel stays square.
 */

const DISC: Record<string, string> = {
  W: "#fffbd5",
  U: "#aae0fa",
  B: "#cbc2bf",
  R: "#f9aa8f",
  G: "#9bd3ae",
  C: "#ccc2c0",
  generic: "#ccc2c0",
};
const INK = "#150b00";
const SHADOW = "#070c17";

// 10×10 glyphs, placed at (3,3) inside the disc.
const GLYPH: Record<string, string[]> = {
  W: ["....kk....", ".k..kk..k.", "..k....k..", "....kk....", "kk.kkkk.kk", "kk.kkkk.kk", "....kk....", "..k....k..", ".k..kk..k.", "....kk...."],
  U: ["....kk....", "....kk....", "...kkkk...", "...kkkk...", "..kkkkkk..", ".kk.kkkkk.", ".kk.kkkkk.", ".kkk.kkkk.", "..kkkkkk..", "...kkkk..."],
  B: ["..kkkkkk..", ".kkkkkkkk.", "kkkkkkkkkk", "kk..kk..kk", "kk..kk..kk", "kkkkkkkkkk", ".kkk..kkk.", "..kkkkkk..", "..k.kk.k..", "..kkkkkk.."],
  R: ["......k...", ".....kk...", "...kkk..k.", "..kkkk.kk.", ".kkkkkkkk.", "kkkk..kkkk", "kkk....kkk", "kkk....kkk", ".kkk..kkk.", "..kkkkkk.."],
  G: ["....kk....", "...kkkk...", "..kkkkkk..", ".kkkkkkkk.", "..kkkkkk..", ".kkkkkkkk.", "kkkkkkkkkk", "...kkkk...", "....kk....", "...kkkk..."],
  C: ["....kk....", "...kkkk...", "..kk..kk..", ".kk....kk.", "kk......kk", "kk......kk", ".kk....kk.", "..kk..kk..", "...kkkk...", "....kk...."],
  P: ["....kk....", "..kkkkkk..", ".k..kk..k.", "k...kk...k", "k...kk...k", ".k..kk..k.", "..kkkkkk..", "....kk....", "....kk....", "...kkkk..."],
  S: ["....kk....", ".k..kk..k.", "..k.kk.k..", "...kkkk...", "kkkkkkkkkk", "kkkkkkkkkk", "...kkkk...", "..k.kk.k..", ".k..kk..k.", "....kk...."],
};

/** Pixel disc: radius 7 centred in the 16 grid, shadow offset one pixel down-left. */
const DISC_MASK: boolean[] = Array.from({ length: 256 }, (_, i) => {
  const x = i % 16, y = Math.floor(i / 16);
  return Math.hypot(x - 7.5, y - 7.5) <= 7.45;
});

/**
 * Pixels merged into one <path> per colour (horizontal runs), cached per input. A symbol used to
 * be ~250 <rect> nodes; a 400-row table of costs made the page crawl.
 */
const pathCache = new Map<string, string>();
function runsPath(key: string, on: (x: number, y: number) => boolean, w = 16, h = 16, dx = 0, dy = 0): string {
  const hit = pathCache.get(key);
  if (hit !== undefined) return hit;
  let d = "";
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!on(x, y)) { x++; continue; }
      const start = x;
      while (x < w && on(x, y)) x++;
      d += `M${start + dx} ${y + dy}h${x - start}v1h-${x - start}z`;
    }
  }
  pathCache.set(key, d);
  return d;
}

const inDisc = (x: number, y: number) => DISC_MASK[y * 16 + x];
const inShadow = (x: number, y: number) => {
  if (inDisc(x, y)) return false;
  const sx = x + 1, sy = y - 1;
  return sx >= 0 && sx < 16 && sy >= 0 && sy < 16 && DISC_MASK[sy * 16 + sx];
};

function Disc({ fill, fill2 }: { fill: string; fill2?: string }) {
  const shadow = runsPath("shadow", inShadow);
  if (!fill2) return <><path d={shadow} fill={SHADOW} /><path d={runsPath("disc", inDisc)} fill={fill} /></>;
  // Hybrid: split along the diagonal.
  return (
    <>
      <path d={shadow} fill={SHADOW} />
      <path d={runsPath("disc-a", (x, y) => inDisc(x, y) && x + y <= 15)} fill={fill} />
      <path d={runsPath("disc-b", (x, y) => inDisc(x, y) && x + y > 15)} fill={fill2} />
    </>
  );
}

function Glyph({ g }: { g: string[] }) {
  return <path d={runsPath(`glyph:${g.join("|")}`, (x, y) => g[y]?.[x] === "k", 10, 10, 3, 3)} fill={INK} />;
}

const NAMES: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless", S: "snow", X: "X", P: "Phyrexian" };

/** One mana symbol. `sym` is the inside of the braces: W, U, 2, X, W/U, 2/B, B/P, S, C… */
export const ManaSymbol = memo(function ManaSymbol({ sym, size = 16 }: { sym: string; size?: 16 | 32 }) {
  const s = sym.toUpperCase();
  const parts = s.split("/");
  const coloured = parts.filter((p) => "WUBRGC".includes(p) && p.length === 1);
  const label = parts.map((p) => NAMES[p] ?? p).join(" or ");

  let body: ReactElement;
  if (parts.length === 1 && GLYPH[s]) {
    body = <><Disc fill={DISC[s] ?? DISC.generic} /><Glyph g={GLYPH[s]} /></>;
  } else if (parts.length === 2 && parts[1] === "P" && coloured.length === 1) {
    body = <><Disc fill={DISC[parts[0]]} /><Glyph g={GLYPH.P} /></>;
  } else if (parts.length === 2 && coloured.length >= 1) {
    const [a, b] = parts;
    body = <><Disc fill={DISC[a] ?? DISC.generic} fill2={DISC[b] ?? DISC.generic} /><Glyph g={GLYPH[coloured[0]]} /></>;
  } else {
    // Generic number, X, or anything else: grey disc + bold numeral.
    const text = s.length > 2 ? s.slice(0, 2) : s;
    body = (
      <>
        <Disc fill={DISC.generic} />
        <text x={7.5} y={11.6} textAnchor="middle" fontSize={text.length > 1 ? 8.5 : 11} fontWeight={700} fontFamily="var(--font-pixelify), system-ui, sans-serif" fill={INK} style={{ fontSizeAdjust: "none" }}>
          {text}
        </text>
      </>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={`${label} mana`} className="shrink-0">
      {body}
    </svg>
  );
});

export const ManaCost = memo(function ManaCost({ cost, size = 16 }: { cost: string; size?: 16 | 32 }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!symbols.length) return null;
  return (
    <span className="inline-flex gap-[2px] align-middle" aria-label={`Mana cost ${cost}`}>
      {symbols.map((s, i) => (
        <ManaSymbol key={i} sym={s} size={size} />
      ))}
    </span>
  );
});

/** Colour identity as a row of symbols, with the guild/shard/wedge name on hover. */
export function ColorIdentity({ ci, size = 16, label }: { ci: readonly string[]; size?: 16 | 32; label?: string }) {
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
