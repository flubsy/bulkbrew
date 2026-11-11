import { DRAGON } from "./grids";
import { bayer, hex, Screen, sprite, type RGB, type Sprite } from "./screen";

/**
 * The BulkBrew courtyard: a night castle, one cauldron lit by its own fire, binder cards
 * arcing in and a sleeved deck rising out. 200×120 art pixels, drawn at 10 fps as frame
 * tables (no easing). Static layers are baked once; each frame copies them and draws the
 * living parts: fire, brew, bubbles, sparks, cards, deck, stars, windows, a passing dragon.
 */

export const SCENE_W = 200;
export const SCENE_H = 120;
/** Where the cauldron sits, for cropping on narrow screens. */
export const FOCUS_X = 128;

const C = {
  sky0: hex("#070c17"), sky1: hex("#0b1324"), sky2: hex("#111c33"),
  star: hex("#f3e9d2"), starDim: hex("#5c6a8e"),
  moonHl: hex("#fbf3dc"), moon: hex("#e9d9a8"), moonSh: hex("#c4ab72"), crater: hex("#a8905c"),
  mortar: hex("#0d1529"), stSh: hex("#182544"), st: hex("#22315a"), stLt: hex("#2e4170"), stMoon: hex("#3e5385"),
  wSh: hex("#2a1a2a"), w: hex("#45262c"), wLt: hex("#6b3426"),
  roofSh: hex("#1e1730"), roof: hex("#30254d"), roofLt: hex("#45386e"), gold: hex("#e9c67c"),
  win: hex("#ff7a4d"), winHl: hex("#ffd27a"), dark: hex("#05080f"),
  gMortar: hex("#0a1122"), g: hex("#1a2645"), gLt: hex("#26365f"),
  gwMortar: hex("#1d1220"), gw: hex("#3a2230"), gwLt: hex("#5c2e28"), gwHot: hex("#7a3a22"),
  ironOut: hex("#04060c"), ironSh: hex("#12141b"), iron: hex("#20232c"), ironLt: hex("#353a4a"), ironMoon: hex("#5f6a88"), ironHl: hex("#a9b3cc"),
  rim0: hex("#5a1e0e"), rim1: hex("#a8340f"), rim2: hex("#ff5a2c"),
  brewDeep: hex("#a8340f"), brew: hex("#ff5a2c"), brewLt: hex("#ff8a52"), brewHl: hex("#ffd27a"), foam: hex("#fff1c4"),
  f0: hex("#7a2a12"), f1: hex("#c43d13"), f2: hex("#ff5a2c"), f3: hex("#ffa040"), f4: hex("#ffd27a"), f5: hex("#fff6d8"),
  woodSh: hex("#24160f"), wood: hex("#4a2d1c"), woodLt: hex("#6b4228"), woodHl: hex("#8a5a34"),
  page: hex("#d9cdb0"), pageSh: hex("#a89c80"), cover: hex("#2b1a3a"), coverLt: hex("#45305e"),
  card: hex("#f3e9d2"), cardSh: hex("#b9b2a0"),
  manaW: hex("#f8f1d0"), manaU: hex("#4f8fd6"), manaB: hex("#6e6385"), manaR: hex("#ff5a2c"), manaG: hex("#4fae6a"),
  boxOut: hex("#070c17"), box: hex("#ff5a2c"), boxSh: hex("#b83a12"), boxLt: hex("#ff8a52"), boxHl: hex("#ffd27a"),
  banner: hex("#c43d13"), bannerLt: hex("#ff5a2c"), bannerSh: hex("#7a2a12"),
  dragon: hex("#1b2a4f"), dragonSh: hex("#141f3c"), ember: hex("#ff5a2c"),
};

const MANA = [C.manaW, C.manaU, C.manaB, C.manaR, C.manaG];

/** Deterministic hash → 0..1 for stone/flame noise. */
function h2(x: number, y: number, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const norm = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as const; };
const MOON_L = norm(-0.6, -0.5, 0.65);
const FIRE_L = norm(0.05, 0.95, 0.35);

/* ----------------------------- static background ----------------------------- */

function bakeBackground(): Screen {
  const s = new Screen(SCENE_W, SCENE_H);
  // Sky: three flat bands with a 2-row ordered-dither seam between each (no gradients).
  for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const t = y < 12 ? C.sky0 : y < 14 ? (bayer(x, y) < 0.5 ? C.sky0 : C.sky1) : y < 24 ? C.sky1 : y < 26 ? (bayer(x, y) < 0.5 ? C.sky1 : C.sky2) : C.sky2;
    s.px(x, y, t);
  }
  // Moon, lit from the upper left like everything else.
  s.ellipse(88, 15, 8, 8, (nx, ny) => {
    const l = -nx * 0.6 - ny * 0.6 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.55;
    return l > 0.75 ? C.moonHl : l > 0.25 ? C.moon : C.moonSh;
  });
  for (const [x, y] of [[85, 12], [86, 12], [91, 17], [87, 19], [90, 13]] as const) s.px(x, y, C.crater);

  // Curtain wall with crenellations.
  const wallTop = 34, wallBot = 84;
  for (let y = wallTop - 6; y < wallBot; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      if (y < wallTop && ((x + 3) % 11) > 6) continue; // gaps between merlons
      const row = Math.floor((y - wallTop + 6) / 5);
      const bx = Math.floor((x + (row % 2) * 5) / 10);
      const inBlockY = (y - wallTop + 6) % 5;
      const inBlockX = (x + (row % 2) * 5) % 10;
      let c: RGB;
      if (inBlockY === 4 || inBlockX === 9) c = C.mortar;
      else {
        const n = h2(bx, row);
        // Moonlight falls off left → right across the wall; fire warms the blocks behind the cauldron.
        const moon = 1 - x / SCENE_W + (n - 0.5) * 0.5;
        c = inBlockY === 0 ? (moon > 0.55 ? C.stMoon : C.stLt) : inBlockY === 3 ? C.stSh : moon > 0.75 ? C.stLt : moon > 0.25 ? C.st : C.stSh;
        const dx = x - FOCUS_X, dy = (y - 100) * 1.6;
        const heat = 1 - Math.hypot(dx, dy) / 62;
        if (heat > 0.35) c = inBlockY === 0 ? C.wLt : inBlockY === 3 ? C.wSh : heat > 0.6 ? C.w : C.wSh;
      }
      s.px(x, y, c);
    }
  }
  // Gate arch, dark, with a lit sill.
  for (let y = 58; y < wallBot; y++) for (let x = 52; x < 72; x++) {
    const ax = (x - 61.5) / 10, ay = (y - 66) / 9;
    if (y < 66 && ax * ax + ay * ay > 1) continue;
    s.px(x, y, x === 52 || x === 71 ? C.mortar : C.dark);
  }

  // Round tower on the left: cylinder shading lit from the left.
  for (let y = 14; y < wallBot; y++) for (let x = 6; x < 34; x++) {
    const nx = (x - 20) / 14;
    const row = Math.floor(y / 4);
    const inY = y % 4;
    const seam = (x + (row % 2) * 3) % 6 === 5;
    let c: RGB = nx < -0.45 ? C.stMoon : nx < 0.15 ? C.stLt : nx < 0.7 ? C.st : C.stSh;
    if (inY === 3 || seam) c = C.mortar;
    if (x === 6 || x === 33) c = C.mortar;
    s.px(x, y, c);
  }
  // Conical roof.
  for (let y = 0; y < 15; y++) {
    const half = Math.round((y / 14) * 17);
    for (let x = 20 - half; x <= 20 + half; x++) {
      const t = (x - (20 - half)) / Math.max(1, half * 2);
      s.px(x, y, x === 20 - half || x === 20 + half ? C.roofSh : t < 0.35 ? C.roofLt : t < 0.75 ? C.roof : C.roofSh);
    }
  }
  s.px(20, 0, C.gold).px(20, 1, C.gold);
  // Tower windows (the lights flicker per frame; frames are drawn here).
  for (const [wx, wy] of [[17, 30], [17, 52]] as const) {
    s.rect(wx - 1, wy - 1, 6, 8, C.dark);
    s.rect(wx, wy, 4, 6, C.win);
    s.rect(wx + 1, wy + 1, 2, 2, C.winHl);
    s.px(wx, wy, C.dark).px(wx + 3, wy, C.dark);
  }

  // Banner hanging on the right of the wall: BulkBrew's orange, a gold cauldron mark.
  s.rect(166, 37, 14, 1, C.gold);
  for (let y = 38; y < 64; y++) for (let x = 167; x < 179; x++) {
    if (y > 58 && Math.abs(x - 172.5) < (y - 58)) continue; // swallowtail
    s.px(x, y, x < 169 ? C.bannerLt : x > 176 ? C.bannerSh : C.banner);
  }
  const mark = [".g...g.", "ggggggg", ".ggggg.", ".ggggg.", "..g.g.."];
  mark.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "g") s.px(170 + i, 45 + j, C.gold); }));
  s.px(172, 42, C.gold).px(174, 43, C.gold);

  // Flagstone courtyard: rows grow taller toward the viewer; warm near the fire.
  let y0 = wallBot;
  for (let row = 0; y0 < SCENE_H; row++) {
    const rh = 4 + row;
    const sw = 12 + row * 3;
    for (let y = y0; y < Math.min(SCENE_H, y0 + rh); y++) for (let x = 0; x < SCENE_W; x++) {
      const off = (row % 2) * Math.floor(sw / 2);
      const inX = (x + off) % sw;
      const top = y === y0;
      const mortar = y === y0 + rh - 1 || inX === sw - 1;
      const heat = 1 - Math.hypot(x - FOCUS_X, (y - 112) * 2.2) / 70;
      const warm = heat > 0.42, hot = heat > 0.72;
      const c = mortar ? (warm ? C.gwMortar : C.gMortar) : top ? (hot ? C.gwHot : warm ? C.gwLt : C.gLt) : warm ? C.gw : C.g;
      s.px(x, y, c);
    }
    y0 += rh;
  }

  // Crate with an open binder on it, foreground left.
  for (let y = 98; y < 118; y++) for (let x = 16; x < 46; x++) {
    const edge = x === 16 || x === 45 || y === 98 || y === 117;
    const plank = (y - 98) % 5 === 4;
    s.px(x, y, edge ? C.woodSh : plank ? C.wood : x < 22 ? C.woodHl : C.woodLt);
  }
  for (const x of [17, 44]) for (let y = 99; y < 117; y++) s.px(x, y, C.wood);
  for (let y = 99; y < 117; y++) s.px(45, y, y % 5 === 3 ? C.wLt : C.w); // firelight on the side facing the cauldron
  // Binder: cover, two pages of card pockets.
  s.rect(13, 92, 36, 7, C.cover).rect(13, 92, 36, 1, C.coverLt);
  s.rect(15, 89, 15, 8, C.page).rect(32, 89, 15, 8, C.page);
  s.rect(30, 89, 2, 8, C.cover);
  for (let p = 0; p < 2; p++) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const x = 16 + p * 17 + i * 3 + (i > 1 ? 1 : 0);
    const y = 90 + j * 3;
    s.rect(x, y, 2, 2, MANA[(i + j * 2 + p) % 5]);
  }
  s.rect(15, 96, 15, 1, C.pageSh).rect(32, 96, 15, 1, C.pageSh);

  return s;
}

/* ----------------------------- the cauldron ----------------------------- */

const CX = FOCUS_X;
const RIM_Y = 74;
const BODY_CY = 86;
const RX = 27;
const RY = 21;

/** Bake the cauldron body + lip as a sprite (transparent elsewhere). */
function bakeCauldron(): { sprite: Sprite; ox: number; oy: number } {
  const ox = CX - RX - 6, oy = RIM_Y - 8;
  const w = RX * 2 + 13, h = BODY_CY + RY - oy + 8;
  const px: (RGB | null)[] = new Array(w * h).fill(null);
  const set = (x: number, y: number, c: RGB) => {
    const ix = x - ox, iy = y - oy;
    if (ix >= 0 && iy >= 0 && ix < w && iy < h) px[iy * w + ix] = c;
  };

  // Legs (drawn first, the bowl overlaps their tops).
  for (const lx of [CX - 17, CX + 14]) for (let y = BODY_CY + 14; y < BODY_CY + RY + 5; y++) for (let x = lx; x < lx + 4; x++) {
    set(x, y, x === lx || x === lx + 3 || y === BODY_CY + RY + 4 ? C.ironOut : x === lx + 1 ? C.ironLt : C.rim0);
  }

  // Bowl: a sphere below the rim, lit by moon (upper left) and fire (below).
  for (let y = RIM_Y; y <= BODY_CY + RY; y++) for (let x = CX - RX; x <= CX + RX; x++) {
    const nx = (x - CX) / RX, ny = (y - BODY_CY) / RY;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const ex = (x + Math.sign(x - CX || 1) - CX) / RX, ey = (y + 1 - BODY_CY) / RY;
    const edge = ex * ex + ny * ny > 1 || nx * nx + ey * ey > 1;
    if (edge) { set(x, y, C.ironOut); continue; }
    const nz = Math.sqrt(Math.max(0, 1 - d));
    const jit = (bayer(x, y) - 0.5) * 0.14; // ordered dither across band seams
    const m = nx * MOON_L[0] + ny * MOON_L[1] + nz * MOON_L[2] + jit;
    const f = nx * FIRE_L[0] + ny * FIRE_L[1] + nz * FIRE_L[2] + jit;
    let c: RGB;
    if (f > 0.8) c = C.rim2;
    else if (f > 0.66) c = C.rim1;
    else if (f > 0.54) c = C.rim0;
    else if (m > 0.9) c = C.ironHl;
    else if (m > 0.72) c = C.ironMoon;
    else if (m > 0.45) c = C.ironLt;
    else if (m > 0.1) c = C.iron;
    else c = C.ironSh;
    set(x, y, c);
  }

  // Handles: iron rings on both sides.
  for (const side of [-1, 1]) {
    const hx = CX + side * (RX + 1);
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const x = Math.round(hx + Math.cos(t) * 3 * side), y = Math.round(RIM_Y + 6 + Math.sin(t) * 3);
      if (side * (x - hx) < -1) continue;
      set(x, y, a < 8 ? C.ironMoon : C.ironLt);
    }
  }

  // Lip: a torus seen from above-front. Back half is shadowed and catches the brew's glow.
  const LRX = RX + 3, LRY = 6.5, IRX = RX - 3, IRY = 4;
  for (let y = RIM_Y - 7; y <= RIM_Y + 7; y++) for (let x = CX - LRX; x <= CX + LRX; x++) {
    const ox2 = (x - CX) / LRX, oy2 = (y - RIM_Y) / LRY;
    if (ox2 * ox2 + oy2 * oy2 > 1) continue;
    const ix = (x - CX) / IRX, iy = (y - RIM_Y) / IRY;
    if (ix * ix + iy * iy <= 1) continue; // the opening (brew drawn per frame)
    const outerEdge = ((x + Math.sign(x - CX || 1) - CX) / LRX) ** 2 + oy2 * oy2 > 1 || ox2 * ox2 + ((y + Math.sign(y - RIM_Y || 1) - RIM_Y) / LRY) ** 2 > 1;
    const innerEdge = ix * ix + iy * iy <= 1.35;
    let c: RGB;
    if (outerEdge) c = C.ironOut;
    else if (y < RIM_Y) c = innerEdge ? C.rim1 : x < CX - 10 ? C.ironLt : C.iron; // back lip, lit by the brew on its inner face
    else if (innerEdge) c = C.ironSh;
    else c = x < CX - 14 ? C.ironHl : x < CX + 4 ? C.ironMoon : x < CX + 18 ? C.ironLt : C.iron;
    set(x, y, c);
  }

  return { sprite: { w, h, px }, ox, oy };
}

/* ----------------------------- animated parts ----------------------------- */

function drawFire(s: Screen, f: number, flare: boolean) {
  // Logs.
  s.rect(CX - 15, 114, 30, 3, C.wood).rect(CX - 15, 114, 30, 1, C.woodLt).rect(CX - 12, 116, 24, 2, C.woodSh);
  s.px(CX - 15, 115, C.woodHl).px(CX + 14, 115, C.woodHl);
  const frame = f % 4;
  const tall = flare ? 1.4 : 1;
  for (let x = CX - 16; x <= CX + 16; x++) {
    const dx = Math.abs(x - CX) / 16;
    const n = h2(x, frame, 7);
    const height = Math.round((14 * (1 - dx * dx) + n * 5 - 2) * tall);
    for (let i = 0; i < height; i++) {
      const y = 114 - i;
      const t = i / Math.max(1, height); // 0 bottom → 1 tip
      const core = dx < 0.35 && t < 0.5;
      const c = core ? (t < 0.25 ? C.f5 : C.f4) : t < 0.35 ? C.f3 : t < 0.65 ? C.f2 : t < 0.88 ? C.f1 : C.f0;
      s.px(x, y, c);
    }
  }
  // Embers popping off the top of the flames (each lives 3 frames).
  for (let k = 0; k < (flare ? 6 : 3); k++) {
    const life = (f + k * 5) % 9;
    if (life > 2) continue;
    s.px(CX - 10 + ((k * 7 + Math.floor(f / 9) * 3) % 21), 103 - life * 2, life === 0 ? C.f4 : C.f2);
  }
}

function drawBrew(s: Screen, f: number, flare: boolean) {
  const IRX = RX - 3, IRY = 4;
  s.ellipse(CX, RIM_Y, IRX, IRY, (nx, ny) => {
    if (ny < -0.55) return C.brewDeep;
    const shimmer = h2(Math.round(nx * 20), Math.round(ny * 4), Math.floor(f / 2)) > (flare ? 0.8 : 0.9);
    if (shimmer) return C.brewHl;
    return nx * nx + ny * ny < 0.35 ? (flare ? C.brewHl : C.brewLt) : C.brew;
  });
  // Bubbles: each one rises in 4 drawings: dot, ring, big ring, pop (1 frame) — then rests.
  const bubbles = flare ? 7 : 4;
  for (let b = 0; b < bubbles; b++) {
    const period = 7 + (b % 3) * 2;
    const t = (f + b * 3) % period;
    const bx = CX - 18 + ((b * 11 + Math.floor((f + b * 3) / period) * 7) % 36);
    const by = RIM_Y - 1 + (b % 2);
    if (t === 0) s.px(bx, by, C.brewHl);
    else if (t === 1) { s.px(bx - 1, by, C.brewLt).px(bx + 1, by, C.brewLt).px(bx, by - 1, C.foam); }
    else if (t === 2) { s.px(bx - 1, by - 1, C.foam).px(bx + 1, by - 1, C.foam).px(bx - 2, by, C.brewLt).px(bx + 2, by, C.brewLt).px(bx, by - 2, C.foam); }
    else if (t === 3) { s.px(bx - 2, by - 2, C.brewHl).px(bx + 2, by - 2, C.brewHl).px(bx, by - 3, C.foam); } // pop
  }
  // Rising sparks above the brew.
  for (let k = 0; k < (flare ? 8 : 5); k++) {
    const life = (f + k * 4) % 16;
    const x = CX - 14 + ((k * 9) % 28) + [0, 0, 1, 1, 0, 0, -1, -1][life % 8];
    const y = RIM_Y - 3 - life * 2;
    s.px(x, y, life < 5 ? C.f4 : life < 11 ? C.f2 : C.f0);
  }
}

const CARD_FRONT = ["kkkkkkk", "kcccccK", "kcmmmcK", "kcmmmcK", "kcmmmcK", "kcdddcK", "kcdddcK", "kcccccK", "kKKKKKK"];
const CARD_SIDE = ["kkkk", "kccK", "kcmK", "kcmK", "kcmK", "kcdK", "kcdK", "kccK", "kKKK"];

/** Cards arc from the binder into the cauldron on a fixed path (quadratic curve, 40 steps). */
const PATH: [number, number][] = (() => {
  const p0 = [30, 86], p1 = [74, 18], p2 = [CX - 4, RIM_Y - 4];
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
})();

function drawCards(s: Screen, f: number) {
  for (let k = 0; k < 5; k++) {
    const step = (f + k * 8) % 48; // 41 steps in flight, then 7 frames' pause
    if (step > 40) continue;
    const [x, y] = PATH[step];
    const color = MANA[(k + Math.floor((f + k * 8) / 48)) % 5];
    // Tumble by changing drawing (face, three-quarter, face…), never by rotating.
    const side = step % 8 === 4 || step % 8 === 5;
    const sp = sprite(side ? CARD_SIDE : CARD_FRONT, { k: C.boxOut, K: C.dark, c: C.card, d: C.cardSh, m: color });
    s.blit(sp, x - (side ? 2 : 3), y - 4);
  }
}

const DECK_BOX = [
  ".kkkkkkkk.",
  "kllllllljk",
  "khooooooSk",
  "khoccccoSk",
  "khocggcoSk",
  "khocggcoSk",
  "khoccccoSk",
  "khooooooSk",
  "khooooooSk",
  "khooooooSk",
  "koooooooSk",
  ".kkkkkkkk.",
];

function drawDeck(s: Screen, f: number) {
  const bob = [0, 0, -1, -1, -1, 0, 0, 1, 1, 1][f % 10];
  const sp = sprite(DECK_BOX, { k: C.boxOut, l: C.boxLt, j: C.box, h: C.boxHl, o: C.box, S: C.boxSh, c: C.card, g: C.gold });
  s.blit(sp, CX - 5, 48 + bob);
  // Four sparkles orbit the deck, each a 4-drawing loop.
  const spots = [[CX - 9, 50], [CX + 8, 46], [CX + 7, 58], [CX - 8, 60]] as const;
  spots.forEach(([x, y], i) => {
    const t = (f + i * 3) % 12;
    if (t === 0) s.px(x, y, C.f4);
    else if (t === 1) s.px(x, y, C.foam).px(x - 1, y, C.f3).px(x + 1, y, C.f3).px(x, y - 1, C.f3).px(x, y + 1, C.f3);
    else if (t === 2) s.px(x - 1, y, C.f2).px(x + 1, y, C.f2);
  });
}

const STARS = (() => {
  const out: { x: number; y: number; p: number }[] = [];
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(h2(i, 1, 3) * SCENE_W), y = Math.floor(h2(i, 2, 3) * 26);
    if (Math.hypot(x - 88, y - 15) < 11 || x < 38) continue;
    out.push({ x, y, p: 9 + Math.floor(h2(i, 3, 3) * 17) });
  }
  return out;
})();

function drawSky(s: Screen, f: number) {
  for (const [i, st] of STARS.entries()) {
    const t = (f + i * 5) % st.p;
    if (t === 0) s.px(st.x, st.y, C.star).px(st.x - 1, st.y, C.starDim).px(st.x + 1, st.y, C.starDim);
    else if (t < st.p - 3) s.px(st.x, st.y, i % 3 ? C.starDim : C.star);
  }
  // A dragon crosses the sky every 56 seconds: 1 art pixel every 2 frames.
  const x = -30 + Math.floor((f % 560) / 2);
  if (x < SCENE_W) s.blit(sprite(DRAGON, { o: C.dragon, O: C.dragonSh, r: C.ember }), x, 6);
}

function drawWindows(s: Screen, f: number) {
  // Candlelight flicker: the highlight shifts between drawings.
  const shifts = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0];
  for (const [wx, wy] of [[17, 30], [17, 52]] as const) {
    const d = shifts[(f + wy) % 10];
    s.rect(wx, wy + 1, 4, 5, C.win);
    s.rect(wx + 1 + d, wy + 2, 2, 2, C.winHl);
  }
}

/* ----------------------------- scene ----------------------------- */

export function createBrewScene() {
  const bg = bakeBackground();
  const cauldron = bakeCauldron();
  const screen = new Screen(SCENE_W, SCENE_H);
  return {
    draw(frame: number, flare = false): Screen {
      screen.copyFrom(bg);
      drawSky(screen, frame);
      drawWindows(screen, frame);
      drawFire(screen, frame, flare);
      screen.blit(cauldron.sprite, cauldron.ox, cauldron.oy);
      drawBrew(screen, frame, flare);
      drawDeck(screen, frame);
      drawCards(screen, frame);
      return screen;
    },
  };
}
