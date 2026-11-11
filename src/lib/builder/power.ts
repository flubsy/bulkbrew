import type { BuiltDeck, Combo, DeckEntry, PowerRating } from "../types";

/**
 * BulkBrew power rating, 1–10, on the scale Commander players already use
 * (≈ EDHPowerLevel / community convention): precons 4–5, tuned casual 6–7, high power 8,
 * cEDH 9–10. It is NOT the same as a bracket: brackets are about which cards are allowed;
 * power is how fast and consistently the deck wins.
 *
 *   1. Start at 4 for a functional deck, minus points for missing fundamentals.
 *   2. Add points only for what actually makes decks faster and more consistent:
 *      low curve, fast mana, tutors, cheap interaction, game changers, real combos.
 *   3. Apply ceilings so a well-built casual deck can't reach cEDH numbers:
 *      no combos and ≤1 tutor → max 7; 9+ needs fast mana, tutors and a combo.
 * Every factor and every cap is returned so the UI (and the FAQ) can show the working.
 */
export function ratePower(deck: Pick<BuiltDeck, "cards" | "commanders" | "stats" | "options">, extra: { combos?: Combo[] } = {}): PowerRating {
  const cards = deck.cards;
  const count = (pred: (c: DeckEntry) => boolean) => cards.filter(pred).reduce((s, c) => s + c.quantity, 0);
  const factors: PowerRating["factors"] = [];
  const caps: { max: number; why: string }[] = [];
  let pts = 4;
  factors.push({ label: "Functional deck baseline", value: "starts at 4", points: 4 });

  // --- Fundamentals: missing ones cost points (precons often miss one or two).
  const lands = deck.stats.lands;
  const ramp = count((c) => c.role === "ramp");
  const draw = count((c) => c.role === "draw");
  const answers = count((c) => c.role === "removal" || c.role === "wipe" || c.role === "counter");
  const gaps: string[] = [];
  if (lands < 32 || lands > 42) gaps.push(`${lands} lands`);
  if (ramp < 7) gaps.push(`${ramp} ramp`);
  if (draw < 6) gaps.push(`${draw} draw`);
  if (answers < 6) gaps.push(`${answers} answers`);
  if (gaps.length) {
    const p = -0.5 * gaps.length;
    pts += p;
    factors.push({ label: "Missing fundamentals", value: gaps.join(", "), points: p });
  }

  // --- Speed: curve and fast mana.
  const avg = deck.stats.avgCmc;
  const curvePts = avg <= 2.2 ? 1.5 : avg <= 2.6 ? 1 : avg <= 3.0 ? 0.5 : avg >= 3.8 ? -0.5 : 0;
  pts += curvePts;
  factors.push({ label: "Mana curve", value: `average ${avg.toFixed(2)}`, points: curvePts });

  const fast = count((c) => c.role === "ramp" && c.cmc <= 1);
  const fastPts = fast >= 4 ? 1 : fast >= 2 ? 0.5 : 0;
  pts += fastPts;
  factors.push({ label: "Fast mana", value: `${fast} ramp at ≤1 mana`, points: fastPts });

  // --- Consistency: tutors.
  const tutors = count((c) => c.role === "tutor");
  const tutorPts = tutors >= 6 ? 1.5 : tutors >= 4 ? 1 : tutors >= 2 ? 0.5 : 0;
  pts += tutorPts;
  factors.push({ label: "Tutors", value: String(tutors), points: tutorPts });

  // --- Interaction quality: cheap answers matter far more than expensive ones.
  const cheap = count((c) => (c.role === "removal" || c.role === "counter" || c.role === "protection") && c.cmc <= 2);
  const intPts = cheap >= 10 ? 1 : cheap >= 6 ? 0.5 : 0;
  pts += intPts;
  factors.push({ label: "Cheap interaction", value: `${cheap} at ≤2 mana`, points: intPts });

  // --- Raw card power: game changers.
  const gc = deck.stats.gameChangers.length;
  const gcPts = Math.min(1, gc * 0.25);
  pts += gcPts;
  factors.push({ label: "Game changers", value: String(gc), points: gcPts });

  // --- Win speed: actual combos (Commander Spellbook), not "combo-ish" text.
  const combos = extra.combos ?? [];
  const twoCard = combos.filter((c) => c.cards.length <= 2).length;
  const comboPts = combos.length >= 3 ? 1.5 : combos.length >= 1 ? 1 : 0;
  pts += comboPts;
  factors.push({ label: "Combos", value: combos.length ? `${combos.length} (${twoCard} two-card)` : "none found", points: comboPts });

  // --- Focus: a tight synergy deck plays above its card quality.
  const nonLand = cards.filter((c) => c.role !== "land");
  const n = nonLand.reduce((s, c) => s + c.quantity, 0) || 1;
  const withData = nonLand.filter((c) => c.edhrec || c.inAverageDeck).reduce((s, c) => s + c.quantity, 0);
  if (withData > 0) {
    const share = withData / n;
    const synPts = share >= 0.7 ? 0.5 : 0;
    pts += synPts;
    factors.push({ label: "Synergy (EDHREC match)", value: `${Math.round(share * 100)}% of non-lands`, points: synPts });
  }

  // --- Ceilings: what a deck must have to reach the top of the scale.
  let max = 10;
  if (combos.length === 0 && tutors <= 1) {
    max = Math.min(max, 7);
    caps.push({ max: 7, why: "Capped at 7: no combos and at most one tutor. Strong casual decks rarely play above a 7." });
  }
  if (!(fast >= 2 && (tutors >= 3 || combos.length >= 1))) {
    max = Math.min(max, 8);
    caps.push({ max: 8, why: "Capped at 8: an 8+ deck needs fast mana (2+ pieces) and either tutors (3+) or a combo." });
  }
  if (!(fast >= 4 && tutors >= 5 && combos.length >= 1)) {
    max = Math.min(max, 8);
    caps.push({ max: 8, why: "Capped at 8: a 9 is fringe cEDH, which needs 4+ fast mana, 5+ tutors and a combo." });
  }
  if (!(fast >= 6 && tutors >= 7 && combos.length >= 2 && avg <= 2.2)) {
    max = Math.min(max, 9);
    caps.push({ max: 9, why: "Capped at 9: a 10 is full cEDH: 6+ fast mana, 7+ tutors, two or more combos and an average mana value of 2.2 or lower." });
  }

  const raw = Math.round(pts);
  const score = Math.max(1, Math.min(max, raw));
  const label = score <= 3 ? "Jank / exhibition" : score <= 5 ? "Precon-level" : score <= 7 ? "Upgraded casual" : score <= 8 ? "High power" : score === 9 ? "Fringe cEDH" : "cEDH";
  // Only report the cap that actually held the score down.
  const binding = raw > score ? caps.filter((c) => c.max === score).map((c) => c.why).slice(0, 1) : [];
  return { score, label, factors, caps: binding };
}

/** Recompute a saved deck's rating with the current formula (old saves stored the old one). */
export function currentPower(deck: Pick<BuiltDeck, "cards" | "commanders" | "stats" | "options" | "combos">): PowerRating {
  return ratePower(deck, { combos: deck.combos });
}
