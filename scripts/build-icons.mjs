// Renders the BulkBrew pixel icon to PNG/SVG at every size browsers, Android and iOS want.
// Pure Node (zlib) — pixel art scales perfectly with nearest-neighbour, so no image library needed.
// Run: npm run icons   (edit GRID below to change the icon)

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const PALETTE = {
  ".": null, // transparent → background
  N: "#0b1324", // navy background
  n: "#22315a", // back card
  l: "#3b4c76", // back card edge
  c: "#f3e9d2", // cream frame
  k: "#111c33", // card face
  o: "#ff5a2c", // orange gem
  O: "#c43d13", // gem shade
  y: "#ffd27a", // gem shine
  g: "#e9c67c", // gold text bar
};

// 16×16: a card fanned over another, with a glowing orange gem. Reads at 16px and 512px.
const GRID = [
  "................",
  "......llllllll..",
  ".....lnnnnnnnnl.",
  "....cccccccccnl.",
  "...ckkkkkkkkcnl.",
  "...ckkkyokkkcnl.",
  "...ckkyooOkkcnl.",
  "...ckyoooOOkcnl.",
  "...ckkoooOkkcnl.",
  "...ckkkoOkkkcl..",
  "...ckkkkkkkkc...",
  "...ckggggggkc...",
  "...ckkkkkkkkc...",
  "...ckggggkkkc...",
  "...cccccccccc...",
  "................",
];

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

function render(size, { pad = 0, bg = PALETTE.N, round = false } = {}) {
  const g = GRID.length;
  const inner = Math.floor(size * (1 - pad * 2));
  const scale = Math.floor(inner / g);
  const off = Math.floor((size - g * scale) / 2);
  const px = Buffer.alloc(size * size * 4);
  const bgc = bg ? hex(bg) : [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let c = bgc;
    const gx = Math.floor((x - off) / scale);
    const gy = Math.floor((y - off) / scale);
    if (gx >= 0 && gy >= 0 && gx < g && gy < g) {
      const ch = GRID[gy][gx];
      if (PALETTE[ch]) c = hex(PALETTE[ch]);
    }
    if (round) {
      // Rounded-square mask for the Apple touch icon look (iOS masks anyway; this keeps previews tidy).
      const r = size * 0.18;
      const dx = Math.max(r - x, x - (size - 1 - r), 0);
      const dy = Math.max(r - y, y - (size - 1 - r), 0);
      if (dx * dx + dy * dy > r * r) c = [0, 0, 0, 0];
    }
    px.set(c, (y * size + x) * 4);
  }
  return png(size, size, px);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function svg() {
  const rects = [];
  GRID.forEach((row, y) => [...row].forEach((ch, x) => { if (PALETTE[ch]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[ch]}"/>`); }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${PALETTE.N}"/>${rects.join("")}</svg>\n`;
}

const root = process.cwd();
const pub = path.join(root, "public", "icons");
await mkdir(pub, { recursive: true });
const out = {
  "public/icons/icon-192.png": render(192),
  "public/icons/icon-512.png": render(512),
  // Android "maskable": the launcher may crop to a circle, so keep the art inside the middle 70%.
  "public/icons/maskable-512.png": render(512, { pad: 0.15 }),
  "public/icons/maskable-192.png": render(192, { pad: 0.15 }),
  "src/app/apple-icon.png": render(180, { pad: 0.08 }),
  "src/app/icon.svg": Buffer.from(svg()),
  "public/icon.svg": Buffer.from(svg()),
};
for (const [p, buf] of Object.entries(out)) {
  await writeFile(path.join(root, p), buf);
  console.log(`${p.padEnd(32)} ${buf.length} bytes`);
}
