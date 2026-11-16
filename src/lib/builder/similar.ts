/**
 * "Decks like yours": score cards by how often real decklists that resemble THIS list run them,
 * not just how often the commander's decks do overall (that's EDHREC's inclusion, already in the
 * score). A card every deck runs gets no extra credit here; a card the closest lists run far more
 * than average does.
 *
 * Each sample deck is weighted by its overlap with the current list (share of our non-land cards it
 * also runs), squared so near-copies count much more than loose matches. Then for a card:
 *   plain    = share of all samples that run it
 *   weighted = weighted share among the samples
 *   fit      = weighted × 4 + max(0, weighted − plain) × 8, capped at 6
 * Pure: the sample decks come in from lib/similar-decks.ts (EDHREC / Archidekt).
 */

export interface SimilarFit {
  /** Fit score for a card name (0 when it never appears). */
  fit: (name: string) => number;
  /** Weighted share (0..1) of the closest decks that run the card. */
  share: (name: string) => number;
  /** How much the closest samples overlap with the list (0..1), for notes. */
  topOverlap: number;
  samples: number;
}

const norm = (n: string) => n.toLowerCase().split(" // ")[0];

export function similarFit(samples: string[][], deckNames: string[]): SimilarFit | null {
  if (samples.length < 8 || deckNames.length < 10) return null;
  const deck = new Set(deckNames.map(norm));
  const sets = samples.map((s) => new Set(s.map(norm)));
  const overlaps = sets.map((s) => { let n = 0; for (const c of deck) if (s.has(c)) n++; return n / deck.size; });
  const weights = overlaps.map((o) => o * o);
  const wTotal = weights.reduce((a, b) => a + b, 0) || 1;
  const plain = new Map<string, number>();
  const weighted = new Map<string, number>();
  sets.forEach((s, i) => {
    for (const c of s) {
      plain.set(c, (plain.get(c) ?? 0) + 1 / sets.length);
      weighted.set(c, (weighted.get(c) ?? 0) + weights[i] / wTotal);
    }
  });
  const top = [...overlaps].sort((a, b) => b - a).slice(0, 5);
  return {
    fit: (name) => {
      const k = norm(name);
      const w = weighted.get(k) ?? 0;
      const p = plain.get(k) ?? 0;
      return Math.min(6, w * 4 + Math.max(0, w - p) * 8);
    },
    share: (name) => weighted.get(norm(name)) ?? 0,
    topOverlap: top.reduce((a, b) => a + b, 0) / (top.length || 1),
    samples: sets.length,
  };
}
