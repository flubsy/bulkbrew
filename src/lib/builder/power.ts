import type { BuiltDeck, DeckEntry, PowerRating } from "../types";

/**
 * Deckbit power rating, 1–10. Commander Salt measures how annoying a card is, not how strong,
 * so we roll our own from things that actually correlate with winning earlier:
 * mana efficiency, fast mana, tutors, interaction density, card advantage, game changers,
 * combo pieces and average EDHREC popularity. It's a heuristic — treat it as a conversation starter.
 */
export function ratePower(deck: Pick<BuiltDeck, "cards" | "commanders" | "stats" | "options">, edhrecRankByName: Map<string, number | null>): PowerRating {
  const cards = deck.cards;
  const nonLand = cards.filter((c) => c.role !== "land");
  const n = nonLand.reduce((s, c) => s + c.quantity, 0) || 1;
  const count = (pred: (c: DeckEntry) => boolean) => cards.filter(pred).reduce((s, c) => s + c.quantity, 0);
  const factors: PowerRating["factors"] = [];
  let pts = 0;

  // 1. Curve: lower is faster. 3.6+ → 0, 2.4 → +2.
  const avg = deck.stats.avgCmc;
  const curvePts = clamp((3.6 - avg) * 1.7, -1, 2);
  pts += curvePts;
  factors.push({ label: "Average mana value", value: avg.toFixed(2), points: r(curvePts) });

  // 2. Ramp density and fast mana.
  const ramp = count((c) => c.role === "ramp");
  const fast = count((c) => c.role === "ramp" && c.cmc <= 1);
  const rampPts = clamp(ramp / 12, 0, 1.2) + Math.min(1.5, fast * 0.5);
  pts += rampPts;
  factors.push({ label: "Ramp / fast mana", value: `${ramp} ramp, ${fast} at ≤1 mana`, points: r(rampPts) });

  // 3. Tutors.
  const tutors = count((c) => c.role === "tutor");
  const tutorPts = Math.min(1.5, tutors * 0.4);
  pts += tutorPts;
  factors.push({ label: "Tutors", value: String(tutors), points: r(tutorPts) });

  // 4. Interaction density (removal + counters + wipes + protection).
  const interaction = count((c) => ["removal", "counter", "wipe", "protection"].includes(c.role));
  const intPts = clamp(interaction / 14, 0, 1.2);
  pts += intPts;
  factors.push({ label: "Interaction", value: String(interaction), points: r(intPts) });

  // 5. Card advantage.
  const draw = count((c) => c.role === "draw");
  const drawPts = clamp(draw / 12, 0, 1);
  pts += drawPts;
  factors.push({ label: "Card draw", value: String(draw), points: r(drawPts) });

  // 6. Game changers.
  const gc = deck.stats.gameChangers.length;
  const gcPts = Math.min(2, gc * 0.5);
  pts += gcPts;
  factors.push({ label: "Game changers", value: String(gc), points: r(gcPts) });

  // 7. Popularity: median EDHREC rank of non-land cards (lower rank → stronger staples).
  const ranks = nonLand.map((c) => edhrecRankByName.get(c.name) ?? null).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const median = ranks.length ? ranks[Math.floor(ranks.length / 2)] : 10000;
  const popPts = clamp((Math.log10(12000) - Math.log10(Math.max(1, median))) * 1.1, 0, 1.5);
  pts += popPts;
  factors.push({ label: "Staple density", value: `median EDHREC rank ${median.toLocaleString()}`, points: r(popPts) });

  // 8. Combo-ish text.
  const combo = count((c) => /untap|infinite|copy|storm|you win the game|loses the game|extra turn/i.test(c.reason + " " + c.typeLine) || c.role === "finisher");
  const comboPts = clamp(combo / 8, 0, 0.8);
  pts += comboPts;
  factors.push({ label: "Finishers / combo pieces", value: String(combo), points: r(comboPts) });

  // 9. Synergy: share of non-land cards that EDHREC lists for this commander. A focused deck
  //    beats a pile of individually decent cards. Only counts when EDHREC data was used.
  const withData = nonLand.filter((c) => c.edhrec || c.inAverageDeck).reduce((s, c) => s + c.quantity, 0);
  if (withData > 0) {
    const share = withData / n;
    const synPts = clamp((share - 0.3) * 3, 0, 1.5);
    pts += synPts;
    factors.push({ label: "Synergy (EDHREC match)", value: `${Math.round(share * 100)}% of non-lands`, points: r(synPts) });
  }

  // Normalise: max ≈ 12.5 → 10; baseline precon ≈ 4.
  const score = clamp(Math.round((pts / 12.5) * 9 + 1), 1, 10);
  const label = score <= 2 ? "Jank / exhibition" : score <= 4 ? "Precon-level" : score <= 6 ? "Upgraded casual" : score <= 8 ? "High power" : "cEDH-adjacent";
  return { score, label, factors };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r = (x: number) => Math.round(x * 10) / 10;
