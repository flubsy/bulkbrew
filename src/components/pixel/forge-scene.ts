import { DRAGON } from "./grids";
import { bayer, hex, Screen, sprite, type RGB } from "./screen";

/**
 * The Bit Forge: Deckbit's home scene. A night castle courtyard where Bit, a little brass
 * cube-bot, hammers cards from your binder into a deck on the anvil, next to a stone forge.
 * 200×120 art pixels at 10 fps, every motion a table of drawings (no easing). Static layers
 * are baked once; each frame copies them and draws the living parts: forge fire, chimney
 * sparks, flying cards, Bit's hammer and blink, strike sparks, the deck box and its counter,
 * stars, candlelit windows and a passing dragon.
 */

export const SCENE_W = 200;
export const SCENE_H = 120;
/** Bit and the anvil, kept in view when narrow screens crop the scene. */
export const FOCUS_X = 124;
/** The forge mouth: where the light comes from. */
const HX = 170, HY = 100;

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
  // Bit: brass body, dark face screen, one glowing eye.
  bitOut: hex("#3a1d0c"), bitHl: hex("#ffe3a6"), bitLt: hex("#f2b066"), bit: hex("#d48a42"), bitSh: hex("#9a5a2a"),
  screen: hex("#12141b"), eye: hex("#ff7a4d"),
  plaque: hex("#2b1a12"), plaqueLt: hex("#4a2d1c"),
};

const MANA = [C.manaW, C.manaU, C.manaB, C.manaR, C.manaG];

/** Deterministic hash → 0..1 for stone/flame noise. */
function h2(x: number, y: number, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}


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
        // Moonlight falls off left → right across the wall; the forge warms the blocks near it.
        const moon = 1 - x / SCENE_W + (n - 0.5) * 0.5;
        c = inBlockY === 0 ? (moon > 0.55 ? C.stMoon : C.stLt) : inBlockY === 3 ? C.stSh : moon > 0.75 ? C.stLt : moon > 0.25 ? C.st : C.stSh;
        const dx = x - HX, dy = (y - HY) * 1.6;
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

  // Banner hanging on the wall: Deckbit's orange with a gold deck-box mark.
  s.rect(126, 37, 14, 1, C.gold);
  for (let y = 38; y < 64; y++) for (let x = 127; x < 139; x++) {
    if (y > 58 && Math.abs(x - 132.5) < (y - 58)) continue; // swallowtail
    s.px(x, y, x < 129 ? C.bannerLt : x > 136 ? C.bannerSh : C.banner);
  }
  const mark = ["ggggggg", "g.....g", "g.ggg.g", "g.ggg.g", "g.....g", "ggggggg"];
  mark.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "g") s.px(130 + i, 44 + j, C.gold); }));
  s.px(133, 42, C.gold);

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
      const heat = 1 - Math.hypot(x - (HX - 20), (y - 112) * 2.2) / 70;
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
  for (let y = 99; y < 117; y++) s.px(45, y, y % 5 === 3 ? C.wLt : C.w); // firelight on the side facing the forge
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

/* ----------------------------- the forge ----------------------------- */

/** Stone forge against the wall: a block with a glowing arched mouth and a chimney. Baked. */
function bakeForge(s: Screen) {
  // Chimney, up past the battlements.
  for (let y = 22; y < 70; y++) for (let x = 163; x < 177; x++) {
    const row = Math.floor(y / 4), inY = y % 4;
    const seam = (x + (row % 2) * 3) % 7 === 6;
    const edge = x === 163 || x === 176;
    s.px(x, y, edge || inY === 3 || seam ? C.mortar : x < 166 ? C.stLt : x > 173 ? C.stSh : C.st);
  }
  s.rect(161, 20, 18, 3, C.stSh).rect(161, 20, 18, 1, C.stLt); // cap
  // Hearth block, wider than the chimney, warm on the stones near the mouth.
  for (let y = 68; y < 114; y++) for (let x = 150; x < 192; x++) {
    const row = Math.floor((y - 68) / 5), inY = (y - 68) % 5;
    const inX = (x + (row % 2) * 4) % 8;
    const mortar = inY === 4 || inX === 7 || x === 150 || x === 191;
    const heat = 1 - Math.hypot(x - HX, (y - HY) * 1.3) / 26;
    s.px(x, y, mortar ? (heat > 0.2 ? C.gwMortar : C.mortar) : inY === 0 ? (heat > 0.25 ? C.wLt : C.stLt) : heat > 0.45 ? C.w : heat > 0.2 ? C.wSh : C.st);
  }
  s.rect(148, 66, 46, 3, C.stLt).rect(148, 66, 46, 1, C.stMoon).rect(148, 68, 46, 1, C.mortar); // ledge
  // The mouth: an arch of darkness the fire is drawn into each frame.
  for (let y = 86; y < 110; y++) for (let x = 157; x < 184; x++) {
    const ax = (x - 170) / 13, ay = (y - 96) / 10;
    if (y < 96 && ax * ax + ay * ay > 1) continue;
    s.px(x, y, C.dark);
  }
  s.rect(155, 110, 31, 2, C.stSh).rect(155, 110, 31, 1, C.stLt); // hearth sill
}

/** Fire inside the forge mouth: a column table per frame, white-hot at the base. */
function drawForgeFire(s: Screen, f: number, flare: boolean) {
  const frame = f % 4;
  const tall = flare ? 1.35 : 1;
  for (let x = 159; x <= 181; x++) {
    const dx = Math.abs(x - 170) / 12;
    const n = h2(x, frame, 7);
    const height = Math.round((12 * (1 - dx * dx) + n * 5 - 1) * tall);
    for (let i = 0; i < Math.min(height, 20); i++) {
      const y = 109 - i;
      const t = i / Math.max(1, height);
      const core = dx < 0.4 && t < 0.45;
      s.px(x, y, core ? (t < 0.2 ? C.f5 : C.f4) : t < 0.35 ? C.f3 : t < 0.65 ? C.f2 : t < 0.88 ? C.f1 : C.f0);
    }
  }
  // Coals along the bottom, glowing in turn.
  for (let x = 160; x < 181; x += 2) s.px(x, 109, (x + f) % 6 < 2 ? C.f4 : C.f2);
  // Sparks out of the chimney: each lives 12 frames, drifting up and sideways.
  for (let k = 0; k < (flare ? 7 : 4); k++) {
    const life = (f + k * 5) % 14;
    if (life > 11) continue;
    const x = 166 + ((k * 5) % 9) + [0, 0, 1, 1, 0, -1, -1, 0][life % 8];
    s.px(x, 18 - life * 2, life < 4 ? C.f4 : life < 8 ? C.f2 : C.f0);
  }
}

/* ----------------------------- anvil, Bit and the deck ----------------------------- */

const AX = 122; // anvil centre
const ANVIL_TOP = 93;

function bakeAnvil(s: Screen) {
  // Stump.
  for (let y = 102; y < 116; y++) for (let x = 112; x < 133; x++) {
    const edge = x === 112 || x === 132 || y === 115;
    s.px(x, y, edge ? C.woodSh : x < 115 ? C.woodHl : (x + y) % 7 === 0 ? C.wood : C.woodLt);
  }
  s.rect(112, 102, 21, 1, C.woodHl);
  // Anvil: face with a horn to the left, waist, foot. Moonlit from the left, forge-lit on the right.
  const iron = (x: number, y: number, edge: boolean) => s.px(x, y, edge ? C.ironOut : x < AX - 8 ? C.ironHl : x > AX + 10 ? C.rim1 : C.ironMoon);
  for (let x = AX - 16; x <= AX + 16; x++) for (let y = ANVIL_TOP; y <= ANVIL_TOP + 3; y++) {
    if (x < AX - 11 && y - ANVIL_TOP > (x - (AX - 16)) / 2) continue; // horn taper
    iron(x, y, y === ANVIL_TOP + 3 || x === AX + 16);
  }
  for (let x = AX - 15; x <= AX + 15; x++) s.px(x, ANVIL_TOP, x > AX + 10 ? C.f3 : C.ironHl); // lit top edge
  for (let y = ANVIL_TOP + 4; y <= ANVIL_TOP + 6; y++) for (let x = AX - 6; x <= AX + 7; x++) iron(x, y, x === AX - 6 || x === AX + 7);
  for (let y = ANVIL_TOP + 7; y <= ANVIL_TOP + 8; y++) for (let x = AX - 10; x <= AX + 11; x++) iron(x, y, x === AX - 10 || x === AX + 11 || y === ANVIL_TOP + 8);
}

/** Bit, facing right: a brass cube with a face screen, a two-pixel eye, an antenna and stubby legs (13×17). */
const BIT = [
  "......a......",
  "......k......",
  "kkkkkkkkkkkkk",
  "kHHHHHHHHHHLk",
  "kLbbbbbbbbbSk",
  "kLbfffffffbSk",
  "kLbffffeefbSk",
  "kLbffffeefbSk",
  "kLbfffffffbSk",
  "kLbbbbbbbbbSk",
  "kLbbobbbbbbSk",
  "kLbbbbbbbbbSk",
  "kSSSSSSSSSSSk",
  "kkkkkkkkkkkkk",
  "..kk.....kk..",
  "..ii.....ii..",
  ".iiii...iiii.",
];
const BX = 90, BY = 99; // Bit's top-left (feet on the flagstones at y 115)

/**
 * The hammer, per frame of Bit's 8-frame swing. [hand x, hand y, head x, head y] relative to Bit.
 * Frame 0 is the strike (head on the anvil, where the card has just landed).
 */
const SWING: [number, number, number, number][] = [
  [13, 8, 20, -8],  // 0 strike: head flat on the anvil face
  [13, 8, 20, -10], // 1 rebound
  [13, 7, 19, -13], // 2 rising
  [13, 6, 17, -17], // 3 up
  [13, 6, 16, -20], // 4 up high
  [13, 6, 16, -20], // 5 hold
  [13, 6, 18, -15], // 6 coming down
  [13, 7, 20, -11], // 7 almost there
];

function drawBit(s: Screen, f: number) {
  const resting = Math.floor(f / 8) % 6 === 0; // one beat in six: no card, Bit pauses
  const blink = f % 37 === 0 || (resting && f % 8 === 3);
  const sp = sprite(BIT, {
    k: C.bitOut, H: C.bitHl, L: C.bitLt, b: C.bit, S: C.bitSh, f: C.screen, i: C.ironLt,
    a: f % 10 < 5 ? C.eye : C.bitHl, e: blink ? C.screen : C.eye, o: f % 6 < 3 ? C.f4 : C.f1,
  });
  s.blit(sp, BX, BY);
  if (!blink) s.px(BX + 8, BY + 6, C.f5); // eye glint
  // Arm + hammer.
  const [hx, hy, ex, ey] = resting ? [12, 8, 15, -3] : SWING[f % 8]; // resting: hammer on the shoulder
  const handX = BX + hx, handY = BY + hy, headX = BX + ex, headY = BY + ey;
  s.rect(handX, handY - 1, 2, 2, C.bitLt).px(handX, handY, C.bitSh);
  // Handle: a Bresenham line from the hand to the head.
  let x0 = handX + 1, y0 = handY;
  const dx = Math.abs(headX - x0), dy = -Math.abs(headY - y0), sx = x0 < headX ? 1 : -1, sy = y0 < headY ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    s.px(x0, y0, C.woodHl);
    if (x0 === headX && y0 === headY) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  s.rect(headX - 2, headY - 1, 6, 3, C.ironMoon).rect(headX - 2, headY - 1, 6, 1, C.ironHl).rect(headX - 2, headY + 1, 6, 1, C.ironLt).px(headX + 3, headY, C.rim1);
}

/** Strike sparks on the anvil: three drawings after each hit (burst, ring, embers). */
function drawStrike(s: Screen, f: number, flare: boolean) {
  if (Math.floor(f / 8) % 6 === 0) return;
  const t = f % 8;
  const cx = BX + 21, cy = ANVIL_TOP - 1;
  if (t === 0) for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [-2, -1], [2, -1]]) s.px(cx + x, cy + y, C.f5);
  else if (t === 1) for (const [x, y] of [[-4, -2], [4, -2], [-3, -4], [3, -4], [0, -5], [-5, 0], [5, 0]]) s.px(cx + x, cy + y, C.f4);
  else if (t === 2) for (const [x, y] of [[-6, -3], [6, -3], [-4, -7], [5, -6], [0, -8]]) s.px(cx + x, cy + y, flare ? C.f3 : C.f2);
  else if (t === 3 && flare) for (const [x, y] of [[-7, -1], [7, -1], [-5, -9], [6, -8]]) s.px(cx + x, cy + y, C.f1);
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
const DX = 141, DY = 99; // deck box on its crate, between the anvil and the forge

/** 3×5 digits for the counter plaque. */
const DIGITS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"], "/": ["..#", "..#", ".#.", "#..", "#.."],
};

function drawText(s: Screen, text: string, x: number, y: number, c: RGB) {
  for (const ch of text) {
    const g = DIGITS[ch];
    if (g) g.forEach((row, j) => [...row].forEach((p, i) => { if (p === "#") s.px(x + i, y + j, c); }));
    x += 4;
  }
}

function bakeDeckStand(s: Screen) {
  // A small crate under the deck box, and the counter plaque on the wall above it.
  for (let y = 111; y < 116; y++) for (let x = 139; x < 153; x++) s.px(x, y, x === 139 || x === 152 || y === 115 ? C.woodSh : y === 111 ? C.woodHl : C.woodLt);
  s.rect(134, 74, 27, 9, C.plaque).rect(134, 74, 27, 1, C.plaqueLt).rect(134, 82, 27, 1, C.woodSh);
  s.px(147, 72, C.gold).px(147, 73, C.plaqueLt); // nail
}

function drawDeckAndCounter(s: Screen, f: number) {
  // A card goes in on every strike: count them (5 per 48-frame round), wrapping at a full deck.
  const delivered = Math.floor(f / 48) * 5 + Math.floor((f % 48) / 8);
  const count = delivered % 100;
  const justIn = f % 8 === 1 && Math.floor(f / 8) % 6 !== 0;
  const sp = sprite(DECK_BOX, { k: C.boxOut, l: justIn ? C.boxHl : C.boxLt, j: C.box, h: C.boxHl, o: justIn ? C.boxLt : C.box, S: C.boxSh, c: C.card, g: C.gold });
  s.blit(sp, DX, DY);
  if (justIn) s.px(DX + 4, DY - 2, C.f4).px(DX + 5, DY - 3, C.foam).px(DX + 6, DY - 2, C.f4);
  // Counter: "37/100", gold on the plaque; the number flashes as it ticks.
  const label = `${count}/100`;
  const w = label.length * 4 - 1;
  drawText(s, label, 147 - Math.floor(w / 2), 76, justIn ? C.foam : C.gold);
  // A full deck: the plaque glows for a beat before the count starts over.
  if (count === 99 && f % 8 >= 4) s.rect(134, 74, 27, 1, C.f3);
}

const CARD_FRONT = ["kkkkkkk", "kcccccK", "kcmmmcK", "kcmmmcK", "kcmmmcK", "kcdddcK", "kcdddcK", "kcccccK", "kKKKKKK"];
const CARD_SIDE = ["kkkk", "kccK", "kcmK", "kcmK", "kcmK", "kcdK", "kcdK", "kccK", "kKKK"];

/** Cards arc from the binder onto the anvil on a fixed path (quadratic curve, 40 steps); the hammer lands as each arrives. */
const PATH: [number, number][] = (() => {
  const p0 = [30, 86], p1 = [70, 22], p2 = [BX + 21, ANVIL_TOP - 5];
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

export function createForgeScene() {
  const bg = bakeBackground();
  bakeForge(bg);
  bakeAnvil(bg);
  bakeDeckStand(bg);
  const screen = new Screen(SCENE_W, SCENE_H);
  return {
    draw(frame: number, flare = false): Screen {
      screen.copyFrom(bg);
      drawSky(screen, frame);
      drawWindows(screen, frame);
      drawForgeFire(screen, frame, flare);
      drawDeckAndCounter(screen, frame);
      drawCards(screen, frame);
      drawBit(screen, frame);
      drawStrike(screen, frame, flare);
      return screen;
    },
  };
}
