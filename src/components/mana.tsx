"use client";

import type { ReactElement } from "react";
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

function Disc({ fill, fill2 }: { fill: string; fill2?: string }) {
  const rects: ReactElement[] = [];
  for (let i = 0; i < 256; i++) {
    const x = i % 16, y = Math.floor(i / 16);
    if (DISC_MASK[i]) {
      const c = fill2 && x + y > 15 ? fill2 : fill; // hybrid: split along the diagonal
      rects.push(<rect key={i} x={x} y={y} width={1} height={1} fill={c} />);
    } else {
      // Shadow where the disc, moved one down-left, would be.
      const sx = x + 1, sy = y - 1;
      if (sx >= 0 && sx < 16 && sy >= 0 && sy < 16 && DISC_MASK[sy * 16 + sx]) rects.push(<rect key={i} x={x} y={y} width={1} height={1} fill={SHADOW} />);
    }
  }
  return <>{rects}</>;
}

function Glyph({ g }: { g: string[] }) {
  const rects: ReactElement[] = [];
  g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "k") rects.push(<rect key={`${x}-${y}`} x={x + 3} y={y + 3} width={1} height={1} fill={INK} />); }));
  return <>{rects}</>;
}

const NAMES: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless", S: "snow", X: "X", P: "Phyrexian" };

/** One mana symbol. `sym` is the inside of the braces: W, U, 2, X, W/U, 2/B, B/P, S, C… */
export function ManaSymbol({ sym, size = 16 }: { sym: string; size?: 16 | 32 }) {
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
}

export function ManaCost({ cost, size = 16 }: { cost: string; size?: 16 | 32 }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!symbols.length) return null;
  return (
    <span className="inline-flex gap-[2px] align-middle" aria-label={`Mana cost ${cost}`}>
      {symbols.map((s, i) => (
        <ManaSymbol key={i} sym={s} size={size} />
      ))}
    </span>
  );
}

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
