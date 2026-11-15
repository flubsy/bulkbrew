import type { CardData } from "../types";

/**
 * Cards that only work when the rest of the deck feeds them. Skullclamp with nothing to clamp,
 * an altar with nothing to sacrifice, a "whenever you cast an instant or sorcery" payoff in a
 * creature deck: each scores well on its own (popular, cheap, tagged as draw or ramp), so the
 * builder used to pick them anyway.
 *
 * Each need has a payoff test, a supplier test, and how many suppliers the rest of the deck has
 * to contain. A commander that supplies counts as several cards, since it's always available.
 * Thresholds are deliberately low: this only catches cards with little to no support.
 */

const front = (c: CardData) => c.typeLine.split("//")[0];
const isCreature = (c: CardData) => /\bCreature\b/.test(front(c));
const makesCreatureTokens = (c: CardData) => /create[^.]*\bcreature tokens?\b|create[^.]*\b\d+\/\d+\b[^.]*\btokens?\b|create[^.]*\btokens? that'?s? a copy/i.test(c.oracleText);

interface Need {
  id: string;
  payoff: (c: CardData) => boolean;
  supplier: (c: CardData) => boolean;
  /** Suppliers wanted in the rest of the deck (commanders count ×COMMANDER_WEIGHT). */
  min: number;
  why: (have: number, min: number) => string;
}

const COMMANDER_WEIGHT = 4;

const NEEDS: Need[] = [
  {
    id: "clamp",
    payoff: (c) => c.name === "Skullclamp" || /equipped creature dies, (you )?draw/i.test(c.oracleText),
    supplier: (c) => makesCreatureTokens(c) || (isCreature(c) && c.toughness === "1"),
    min: 8,
    why: (have, min) => `needs creatures with 1 toughness or token makers to equip, and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "sacrifice",
    // Free sac outlets and "whenever a creature dies" payoffs. Not edicts or one-off sacrifice costs.
    payoff: (c) => /sacrifice (a|another) creature:|whenever (a|another) (nontoken )?creature (you control )?dies|whenever (a|another) creature you control dies/i.test(c.oracleText) && !/each (opponent|player) sacrifices/i.test(c.oracleText),
    supplier: (c) => makesCreatureTokens(c) || (isCreature(c) && c.cmc <= 2),
    min: 12,
    why: (have, min) => `wants a steady supply of creatures to sacrifice (tokens or cheap creatures), and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "spells",
    payoff: (c) => /whenever you cast (or copy )?an instant or sorcery|magecraft/i.test(c.oracleText),
    supplier: (c) => /\b(Instant|Sorcery)\b/.test(front(c)),
    min: 15,
    why: (have, min) => `pays off instants and sorceries, and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "noncreature",
    payoff: (c) => /whenever you cast a noncreature spell/i.test(c.oracleText),
    supplier: (c) => !isCreature(c) && !/\bLand\b/.test(front(c)),
    min: 20,
    why: (have, min) => `pays off noncreature spells, and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "lifegain",
    payoff: (c) => /whenever you gain life/i.test(c.oracleText),
    supplier: (c) => /\byou gain \d+ life|gain(s)? (that much|x|\d+) life|\blifelink\b/i.test(c.oracleText) || c.keywords.includes("Lifelink"),
    min: 8,
    why: (have, min) => `triggers on gaining life, and the list has ${have} life-gain cards (wants ${min}+)`,
  },
  {
    id: "tokens",
    payoff: (c) => /creature tokens you control|tokens you control (get|have)|whenever (one or more )?(creature )?tokens? (you control )?enters?/i.test(c.oracleText),
    supplier: makesCreatureTokens,
    min: 8,
    why: (have, min) => `rewards creature tokens, and the list has ${have} token makers (wants ${min}+)`,
  },
  {
    id: "counters",
    payoff: (c) => /whenever one or more \+1\/\+1 counters|with a \+1\/\+1 counter on it|for each \+1\/\+1 counter/i.test(c.oracleText),
    supplier: (c) => /put (a|an|one|two|three|x|that many|\w+) \+1\/\+1 counters?|enters? with [^.]*\+1\/\+1 counters?|\bproliferate\b/i.test(c.oracleText),
    min: 8,
    why: (have, min) => `cares about +1/+1 counters, and the list has ${have} cards that place them (wants ${min}+)`,
  },
  {
    id: "artifacts",
    payoff: (c) => /whenever (an|another) (nontoken )?artifact (you control )?enters|for each artifact you control|affinity for artifacts|\bmetalcraft\b|\bimprovise\b|artifacts? you control (get|have)/i.test(c.oracleText),
    supplier: (c) => /\bArtifact\b/.test(front(c)) || /create[^.]*\b(treasure|clue|food|blood|artifact) tokens?/i.test(c.oracleText),
    min: 15,
    why: (have, min) => `scales with artifacts, and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "enchantments",
    payoff: (c) => /\bconstellation\b|whenever (an|another) enchantment (you control )?enters|whenever you cast an enchantment|for each enchantment you control/i.test(c.oracleText),
    supplier: (c) => /\bEnchantment\b/.test(front(c)),
    min: 12,
    why: (have, min) => `scales with enchantments, and the list has ${have} (wants ${min}+)`,
  },
];

/** The needs a card has (usually none). */
export function needsOf(card: CardData): Need[] {
  return NEEDS.filter((n) => n.payoff(card));
}

/**
 * Why `card` would be dead weight in a deck of `others` + `commanders`, or null if it's supported
 * (or needs nothing). `others` may include the card itself; it's never counted as its own supplier.
 */
export function unmetNeed(card: CardData, others: CardData[], commanders: CardData[]): string | null {
  for (const n of needsOf(card)) {
    let have = 0;
    for (const o of others) if (o.name !== card.name && n.supplier(o)) have++;
    for (const c of commanders) if (n.supplier(c) || n.payoff(c)) have += COMMANDER_WEIGHT; // a commander that cares about it brings its own plan
    if (have < n.min) return `${card.name} ${n.why(have, n.min)}`;
  }
  return null;
}
