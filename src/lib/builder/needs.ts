import type { CardData } from "../types";
import { cardTags, type TagKey } from "./tags";

const tagged = (c: CardData, ...keys: TagKey[]) => { const t = cardTags(c.name); return keys.some((k) => t.has(k)); };

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
const makesCreatureTokens = (c: CardData) => tagged(c, "tokenMaker") || /create[^.]*\bcreature tokens?\b|create[^.]*\b\d+\/\d+\b[^.]*\btokens?\b|create[^.]*\btokens? that'?s? a copy/i.test(c.oracleText);

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
    payoff: (c) => tagged(c, "sacOutlet") || /sacrifice (a|another) creature:|whenever (a|another) (nontoken )?creature (you control )?dies|whenever (a|another) creature you control dies/i.test(c.oracleText) && !/each (opponent|player) sacrifices/i.test(c.oracleText),
    supplier: (c) => makesCreatureTokens(c) || (isCreature(c) && c.cmc <= 2),
    min: 12,
    why: (have, min) => `wants a steady supply of creatures to sacrifice (tokens or cheap creatures), and the list has ${have} (wants ${min}+)`,
  },
  {
    id: "spells",
    payoff: (c) => tagged(c, "spellsMatter") || /whenever you cast (or copy )?an instant or sorcery|magecraft/i.test(c.oracleText),
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
    id: "drawdrain",
    // Psychosis Crawler, Niv-Mizzet, Smothering Tithe-style punishers that pay off card draw.
    payoff: (c) => /whenever (you|a player|an opponent) draws? (a|one or more) cards?[^.]*(loses?|deals?)/i.test(c.oracleText),
    supplier: (c) => /\bdraws? (two|three|four|seven|x|that many|\d+|cards equal|a card for each)\b|\bdraw cards?\b|each player draws|whenever [^.]* draw a card/i.test(c.oracleText),
    min: 12,
    why: (have, min) => `only pays off when you draw lots of cards, and the list has ${have} draw engines (wants ${min}+)`,
  },
  {
    id: "lifegain",
    payoff: (c) => /whenever you gain life/i.test(c.oracleText),
    supplier: (c) => tagged(c, "lifegain") || /\byou gain \d+ life|gain(s)? (that much|x|\d+) life|\blifelink\b/i.test(c.oracleText) || c.keywords.includes("Lifelink"),
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
    supplier: (c) => tagged(c, "counterPlacer") || /put (a|an|one|two|three|x|that many|\w+) \+1\/\+1 counters?|enters? with [^.]*\+1\/\+1 counters?|\bproliferate\b/i.test(c.oracleText),
    min: 8,
    why: (have, min) => `cares about +1/+1 counters, and the list has ${have} cards that place them (wants ${min}+)`,
  },
  {
    id: "artifacts",
    payoff: (c) => /whenever (an|another) (nontoken )?artifact (you control )?enters|for each artifact you control|affinity for artifacts|\bmetalcraft\b|\bimprovise\b|artifacts? you control (get|have)/i.test(c.oracleText),
    supplier: (c) => /\bArtifact\b/.test(front(c)) || tagged(c, "treasureMaker") || /create[^.]*\b(treasure|clue|food|blood|artifact) tokens?/i.test(c.oracleText),
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

const SUPPLY_LABEL: Record<string, string> = {
  clamp: "fodder for Skullclamp", sacrifice: "sacrifice fodder", spells: "instants and sorceries", noncreature: "noncreature spells",
  lifegain: "life gain", tokens: "creature tokens", counters: "+1/+1 counters", artifacts: "artifacts", enchantments: "enchantments", drawdrain: "card draw",
};

/** What a card supplies and pays off, computed once per card. */
interface NeedProfile { sup: string[]; pay: string[] }
const profiles = new WeakMap<CardData, NeedProfile>();
function profile(c: CardData): NeedProfile {
  let p = profiles.get(c);
  if (!p) {
    p = { sup: NEEDS.filter((n) => n.supplier(c)).map((n) => n.id), pay: NEEDS.filter((n) => n.payoff(c)).map((n) => n.id) };
    profiles.set(c, p);
  }
  return p;
}

export type NeedCounts = { sup: Record<string, number>; pay: Record<string, number> };

/** Suppliers and payoffs per need across a list (a commander that pays off counts ×4). */
export function needCounts(deck: CardData[], commanders: CardData[]): NeedCounts {
  const out: NeedCounts = { sup: {}, pay: {} };
  for (const c of deck) {
    const p = profile(c);
    for (const id of p.sup) out.sup[id] = (out.sup[id] ?? 0) + 1;
    for (const id of p.pay) out.pay[id] = (out.pay[id] ?? 0) + 1;
  }
  for (const c of commanders) for (const id of profile(c).pay) out.pay[id] = (out.pay[id] ?? 0) + COMMANDER_WEIGHT;
  return out;
}

/**
 * How much a card links up with a list (from needCounts): as a supplier, half a point per payoff
 * that wants what it supplies; as a payoff, half a point per supplier once the need is met.
 * Capped at 5, so synergy tips close calls without overriding EDHREC and role balance.
 * `inDeck`: the card is already counted in `counts`, so it's taken out of its own numbers.
 */
export function synergyWith(card: CardData, counts: NeedCounts, inDeck = false): { score: number; why: string } {
  const p = profile(card);
  const self = inDeck ? 1 : 0;
  let score = 0;
  const bits: string[] = [];
  for (const id of p.sup) {
    const payoffs = (counts.pay[id] ?? 0) - (p.pay.includes(id) ? self : 0);
    if (payoffs > 0) { score += payoffs * 0.5; bits.push(`${SUPPLY_LABEL[id]} for ${payoffs} payoff${payoffs === 1 ? "" : "s"}`); }
  }
  for (const id of p.pay) {
    const need = NEEDS.find((n) => n.id === id)!;
    const suppliers = (counts.sup[id] ?? 0) - (p.sup.includes(id) ? self : 0);
    if (suppliers >= need.min) { score += suppliers / 2; bits.push(`pays off ${suppliers} cards giving ${SUPPLY_LABEL[id]}`); }
  }
  return { score: Math.min(5, score), why: bits.slice(0, 2).join(", ") };
}
