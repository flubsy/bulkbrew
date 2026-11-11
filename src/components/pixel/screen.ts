/**
 * Minimal pixel-art screen: an RGBA buffer at the art's own resolution, drawn with whole
 * pixels only, then blown up with nearest-neighbour at an integer scale. Follows
 * .claude/skills/pixel-art-skill: one grid, no smoothing, no sub-pixel positions.
 */

export type RGB = readonly [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface Sprite {
  w: number;
  h: number;
  px: (RGB | null)[];
}

const spriteCache = new WeakMap<readonly string[], Map<string, Sprite>>();

/** Compile a string map ('.' = transparent) against a palette. Cached per rows array. */
export function sprite(rows: readonly string[], pal: Record<string, RGB>): Sprite {
  const palKey = Object.entries(pal).map(([k, v]) => k + v.join(",")).join(";");
  let byPal = spriteCache.get(rows);
  if (!byPal) { byPal = new Map(); spriteCache.set(rows, byPal); }
  const hit = byPal.get(palKey);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px: (RGB | null)[] = new Array(w * h).fill(null);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== "." && ch !== " " && pal[ch]) px[y * w + x] = pal[ch]; }));
  const s = { w, h, px };
  byPal.set(palKey, s);
  return s;
}

export class Screen {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  clear(c: RGB) {
    for (let i = 0; i < this.w * this.h; i++) {
      const o = i * 4;
      this.data[o] = c[0]; this.data[o + 1] = c[1]; this.data[o + 2] = c[2]; this.data[o + 3] = 255;
    }
    return this;
  }

  copyFrom(other: Screen) {
    this.data.set(other.data);
    return this;
  }

  px(x: number, y: number, c: RGB) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const o = (y * this.w + x) * 4;
    this.data[o] = c[0]; this.data[o + 1] = c[1]; this.data[o + 2] = c[2]; this.data[o + 3] = 255;
    return this;
  }

  get(x: number, y: number): RGB {
    const o = (Math.round(y) * this.w + Math.round(x)) * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
    return this;
  }

  /** Filled ellipse; `shade(dx, dy)` may return a colour per pixel (dx, dy normalised -1..1). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB | ((nx: number, ny: number, edge: boolean) => RGB | null)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        // Edge = a neighbour one pixel out falls outside: lets shaders draw a 1px outline.
        const ex = (x + Math.sign(x - cx || 1) - cx) / rx;
        const ey = (y + Math.sign(y - cy || 1) - cy) / ry;
        const edge = ex * ex + ny * ny > 1 || nx * nx + ey * ey > 1;
        const col = typeof c === "function" ? c(nx, ny, edge) : c;
        if (col) this.px(x, y, col);
      }
    }
    return this;
  }

  blit(s: Sprite, x: number, y: number, opts: { flip?: boolean; tint?: (c: RGB) => RGB } = {}) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < s.h; j++) {
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + (opts.flip ? s.w - 1 - i : i)];
        if (c) this.px(x + i, y + j, opts.tint ? opts.tint(c) : c);
      }
    }
    return this;
  }

  /** Nearest-neighbour present: crop (sx, w) of the art, at integer scale k, into a canvas. */
  present(ctx: CanvasRenderingContext2D, k: number, sx = 0, vw = this.w) {
    const img = new ImageData(vw, this.h);
    for (let y = 0; y < this.h; y++) {
      const src = (y * this.w + sx) * 4;
      img.data.set(this.data.subarray(src, src + vw * 4), y * vw * 4);
    }
    const off = presentCanvas(vw, this.h);
    off.getContext("2d")!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, vw * k, this.h * k);
  }
}

let offscreen: HTMLCanvasElement | null = null;
function presentCanvas(w: number, h: number) {
  if (!offscreen) offscreen = document.createElement("canvas");
  if (offscreen.width !== w) offscreen.width = w;
  if (offscreen.height !== h) offscreen.height = h;
  return offscreen;
}

/** 4×4 Bayer matrix (0..15) for ordered dithering between two ramp tones. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)] / 16;
