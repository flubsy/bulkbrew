/**
 * Pixel sprites drawn as SVG rect grids. Each sprite is a string grid; one character per pixel.
 * Palette: . transparent, # navy-900, o orange, O orange-deep, g gold, c cream, d cream-dim, m muted,
 *          s sea-light, n navy-600, l line, k ink-700, r red, e green, y pale yellow, w window glow
 */

const PALETTE: Record<string, string> = {
  "#": "var(--navy-900)",
  o: "var(--orange)",
  O: "var(--orange-deep)",
  g: "var(--gold)",
  c: "var(--cream)",
  d: "var(--cream-dim)",
  m: "var(--muted)",
  s: "var(--sea-light)",
  n: "var(--navy-600)",
  l: "var(--line)",
  k: "var(--ink-700)",
  r: "var(--red)",
  e: "var(--green)",
  y: "#ffd27a",
  w: "#ffb36b",
  b: "var(--sea)",
  x: "currentColor",
};

/** One <path> per colour (horizontal runs), cached per grid: far fewer DOM nodes than a rect per pixel. */
const spriteCache = new WeakMap<string[], { w: number; h: number; paths: { fill: string; d: string }[] }>();
function compile(grid: string[]) {
  const hit = spriteCache.get(grid);
  if (hit) return hit;
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const byColour = new Map<string, string>();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !PALETTE[ch]) { x++; continue; }
      const start = x;
      while (x < row.length && row[x] === ch) x++;
      byColour.set(ch, (byColour.get(ch) ?? "") + `M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  const out = { w, h, paths: [...byColour].map(([ch, d]) => ({ fill: PALETTE[ch], d })) };
  spriteCache.set(grid, out);
  return out;
}

export function Sprite({ grid, scale = 4, className = "", title, style }: { grid: string[]; scale?: number; className?: string; title?: string; style?: React.CSSProperties }) {
  const { w, h, paths } = compile(grid);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

export const MOON = [
  "....gggggg....",
  "..gggggggggg..",
  ".gggggdggggggg",
  ".ggggdddgggggg",
  "gggggdggggggdg",
  "ggggggggggdddg",
  "gggdgggggggddg",
  "ggdddggggggggg",
  "gggdgggggdgggg",
  "ggggggggdddggg",
  ".gggggggggdggg",
  ".gggggggggggg.",
  "..gggggggggg..",
  "....gggggg....",
];

/** A castle on a cliff. 40 wide. */
export const CASTLE = [
  "..........k.k.k.........k.k.k...........",
  "..........kkkkk.........kkkkk...........",
  "..........kkkkk....o....kkkkk...........",
  "..........kwkkk...ooo...kkkwk...........",
  "..........kkkkk..k.k.k..kkkkk...........",
  "..........kkkkk..kkkkk..kkkkk...........",
  "......k.k.kkkkkkkkkkkkkkkkkkk.k.k.......",
  "......kkkkkkkkkkkkkkwkkkkkkkkkkkkk......",
  "......kkkkkkkkkwkkkkkkkkkwkkkkkkkk......",
  "......kkkwkkkkkkkkkkkkkkkkkkkkwkkk......",
  "......kkkkkkkkkkkkk###kkkkkkkkkkkk......",
  "......kkkkkkkkkkkk#####kkkkkkkkkkk......",
  "....llkkkkkkkkkkkk#####kkkkkkkkkkkll....",
  "...llllllllllllllllllllllllllllllllll...",
  "..llllllllllllllllllllllllllllllllllll..",
  ".lllllllnnllllllllllllllllllnnlllllllll.",
  ".llllllnnnnlllllllllllllllnnnnlllllllll.",
  "llllllnnnnnnlllllllllllllnnnnnnllllllllll",
  "lllllnnnnnnnnlllllllllllnnnnnnnnlllllllll",
  "llllnnnnnnnnnnlllllllllnnnnnnnnnnllllllll",
];

export { DRAGON } from "./pixel/grids";

/** Leviathan breaching: head left, coils right. 36 wide. */
export const LEVIATHAN = [
  "..ss................................",
  ".sssss............................ss",
  "ssyssss..........ssss............sss",
  "ssssssss........ssssss..........ssss",
  ".sssssss.......sssssssss.......sssss",
  "..ssssssss....ssss..ssssss....ssss..",
  "....ssssssssssss......sssssssssss...",
  "......ssssssss..........sssssss.....",
];


/** A wizard with a staff, 12 wide. */
export const WIZARD = [
  ".....o......",
  "....ooo.....",
  "...ooooo....",
  "..ooooooo...",
  ".ooooooooo..",
  "....ccc...g.",
  "...c#c#c..g.",
  "....ccc...g.",
  "...ddddd..g.",
  "..nnnnnnn.g.",
  "..nnnnnnn.g.",
  "..nnnnnnnng.",
  "..nnnnnnn.g.",
  "..nnnnnnn.g.",
  "...nn.nn..g.",
];

export const CARD = [
  "cccccccccc",
  "c########c",
  "c#oooooo#c",
  "c#o####o#c",
  "c#o#oo#o#c",
  "c#o####o#c",
  "c#oooooo#c",
  "c########c",
  "c#cccccc#c",
  "c#cccccc#c",
  "c########c",
  "cccccccccc",
];

export const SKULL = [
  "..cccccc..",
  ".cccccccc.",
  "cccccccccc",
  "cc##cc##cc",
  "cc##cc##cc",
  "cccccccccc",
  ".ccc##ccc.",
  "..c#cc#c..",
  "..cccccc..",
  "..c.cc.c..",
];

export const GEAR = [
  "...oo..oo...",
  "..oooooooo..",
  ".ooo####ooo.",
  "ooo##oo##ooo",
  "oo##oooo##oo",
  ".o##oooo##o.",
  ".o##oooo##o.",
  "oo##oooo##oo",
  "ooo##oo##ooo",
  ".ooo####ooo.",
  "..oooooooo..",
  "...oo..oo...",
];

/** Spellbook with a glowing rune. */
export const TOME = [
  "kkkkkkkkkkkkkk",
  "kddddddkdddddk",
  "kddddddkdddddk",
  "kdd.o.dkd.o.dk",
  "kd.ooo.kd.o.dk",
  "kdd.o.dkd.o.dk",
  "kddddddkdddddk",
  "kddddddkdddddk",
  "kkkkkkkkkkkkkk",
  ".kkkkkkkkkkkk.",
];

/** A d6 showing five pips. */
export const DIE = [
  ".cccccccc.",
  "cddddddddc",
  "cd##dd##dc",
  "cd##dd##dc",
  "cdddo#dddc",
  "cddd##dddc",
  "cd##dd##dc",
  "cd##dd##dc",
  "cddddddddc",
  ".cccccccc.",
];

/** Anvil, for the upgrade forge. */
export const ANVIL = [
  "oooooooooooo..",
  ".kkkkkkkkkkkkk",
  "..kkkkkkkkkkk.",
  "....kkkkkk....",
  ".....kkkk.....",
  "....kkkkkk....",
  "..kkkkkkkkkk..",
];

/** Sword, point up. */
export const SWORD = [
  "...c...",
  "..ccc..",
  "..ccc..",
  "..ccc..",
  "..ccc..",
  "..ccc..",
  "ggggggg",
  "...k...",
  "...k...",
  "..ggg..",
];

/* ---------- 11×11 nav icons (drawn for 2× scale) ---------- */

export const ICON_HOME = [
  ".k.k...k.k.",
  ".kkk...kkk.",
  ".kok...kok.",
  ".kkk.o.kkk.",
  ".kkkkkkkkk.",
  ".kkwkkkwkk.",
  ".kkkkkkkkk.",
  ".kkkk#kkkk.",
  ".kkk###kkk.",
  "lllll#lllll",
  "lllllllllll",
];

export const ICON_CARDS = [
  "...dddddd..",
  "..dkkkkkkd.",
  ".dddddd.kd.",
  ".d####d.kd.",
  ".d#oo#d.kd.",
  ".d#oo#d.kd.",
  ".d####d.kd.",
  ".dccccd.kd.",
  ".dccccdkkd.",
  ".ddddddddd.",
  "...........",
];

export const ICON_SWORD = [
  "........cc.",
  ".......ccc.",
  "......ccc..",
  ".....ccc...",
  "....ccc....",
  ".g.ccc.....",
  ".ggcc......",
  "..gg.......",
  ".k.gg......",
  "kk..g......",
  "k..........",
];

export const ICON_DIE = [
  ".ccccccccc.",
  "cdddddddddc",
  "cd#ddddd#dc",
  "cdddddddddc",
  "cdddd#ddddc",
  "cdddddddddc",
  "cd#ddddd#dc",
  "cdddddddddc",
  "cdddddddddc",
  ".ccccccccc.",
  "...........",
];

export const ICON_ANVIL = [
  "...........",
  "...........",
  "..o........",
  ".ooooooooo.",
  "..kkkkkkkkk",
  "...kkkkkkk.",
  ".....kkk...",
  "....kkkkk..",
  "...kkkkkkk.",
  "...........",
  "...........",
];

export const ICON_CHEST = [
  "...........",
  "..ggggggg..",
  ".gOOOOOOOg.",
  ".gOOOOOOOg.",
  ".ggggoggg..",
  ".gOOOoOOOg.",
  ".gOOOOOOOg.",
  ".gOOOOOOOg.",
  ".ggggggggg.",
  "...........",
  "...........",
];

/** Kraken tentacle, for the bay. */
export const TENTACLE = [
  "....ss..",
  "...s..s.",
  "...s..s.",
  "....s.s.",
  "......s.",
  ".....ss.",
  "....ss..",
  "...ss...",
  "..ss....",
  ".sss....",
  "ssss....",
];

/** Cauldron mark (11×11): BulkBrew's logo glyph, nav and favicon companion. */
export const ICON_CAULDRON = [
  "...y...y...",
  "....y.y....",
  ".#########.",
  "#mwoooooOO#",
  ".#lllllll#.",
  ".#mlllllk#.",
  ".#mllllkk#.",
  "..#lllkk#..",
  "...#####...",
  "..o.oyo.o..",
  "...ooyoo...",
];

/** A sleeved deck box (10×12), the thing that rises out of the brew. */
export const DECK_BOX = [
  ".########.",
  "#wwwwwwwo#",
  "#yooooooO#",
  "#yoccccoO#",
  "#yocggcoO#",
  "#yocggcoO#",
  "#yoccccoO#",
  "#yooooooO#",
  "#yooooooO#",
  "#yooooooO#",
  "#oooooooO#",
  ".########.",
];

/** An open binder of cards (14×9): your bulk. */
export const BINDER = [
  "..............",
  ".dddddd.dddddd",
  ".dobd#d.dedbd#",
  ".d#d#d#.d#d#d#",
  ".dedod#.dodyd#",
  ".d#d#d#.d#d#d#",
  ".dddddd.dddddd",
  "nnnnnnnnnnnnnn",
  ".nnnnnnnnnnnn.",
];

/** A pointing arrow (7×7) for sequences and links. */
export const ARROW = [
  "...o...",
  "...oo..",
  "ooooOo.",
  "oooooOo",
  "ooooOo.",
  "...oo..",
  "...o...",
];

/* ---------- 7×7 control glyphs, drawn in the text colour (x = currentColor) ---------- */
export const GLYPH_PLUS = ["...x...", "...x...", "...x...", "xxxxxxx", "...x...", "...x...", "...x..."];
export const GLYPH_MINUS = [".......", ".......", ".......", "xxxxxxx", ".......", ".......", "......."];
export const GLYPH_CROSS = ["x.....x", ".x...x.", "..x.x..", "...x...", "..x.x..", ".x...x.", "x.....x"];
export const GLYPH_CHEVRON = [".x.....", "..x....", "...x...", "....x..", "...x...", "..x....", ".x....."];
export const GLYPH_SWAP = ["....x..", "xxxxxx.", "....x..", ".......", "..x....", ".xxxxxx", "..x...."];
