/**
 * Monumental pixel numerals: a 5×7 bitmap face drawn as crisp SVG rects, with a lit top edge
 * and a shaded bottom row so the digits sit in the same pixel world as the art. Text stays in the
 * DOM for screen readers and copy/paste (the SVG is decorative).
 */

const GLYPHS: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ",": [".....", ".....", ".....", ".....", ".....", "..#..", ".#..."],
  "k": ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
};

export function PixelNumber({ value, scale = 5, color = "var(--cream)", light = "#ffffff", shade = "var(--cream-dim)", className = "" }: { value: number | string; scale?: number; color?: string; light?: string; shade?: string; className?: string }) {
  const text = typeof value === "number" ? value.toLocaleString("en-US") : value;
  const chars = [...text].filter((ch) => GLYPHS[ch]);
  const advance = 6;
  const w = Math.max(1, chars.length * advance - 1);
  const rects: { x: number; y: number; c: string }[] = [];
  chars.forEach((ch, i) => {
    GLYPHS[ch].forEach((row, y) => [...row].forEach((p, x) => {
      if (p !== "#") return;
      // Lit where the pixel above is empty, shaded on the bottom row: a pressed-metal read.
      const above = y > 0 && GLYPHS[ch][y - 1][x] === "#";
      rects.push({ x: i * advance + x, y, c: y === 6 ? shade : !above ? light : color });
    }));
  });
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <svg viewBox={`0 0 ${w} 7`} width={w * scale} height={7 * scale} shapeRendering="crispEdges" aria-hidden>
        {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={1} height={1} fill={r.c} />)}
      </svg>
      <span className="sr-only">{text}</span>
    </span>
  );
}
