import { cached, DAY } from "./server-cache";
import type { Bracket, BuiltDeck, Combo } from "./types";

/**
 * Commander Spellbook (commanderspellbook.com) combo finder. Free, public, no key.
 * POST a card list, get back combos fully included and combos one card away.
 */

/** Spellbook's bracket tags (BracketTagEnum in its API client). */
const BRACKET_TAG: Record<string, string> = {
  R: "Ruthless",
  S: "Spicy",
  P: "Powerful",
  O: "Oddball",
  C: "Core",
  E: "Exhibition",
  B: "Banned",
};

type ApiCombo = {
  id: string;
  uses: { card: { name: string } }[];
  produces: { feature: { name: string } }[];
  description?: string;
  bracketTag?: string;
  popularity?: number;
  manaValueNeeded?: number;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
};
type ApiResult = { results?: { included?: ApiCombo[]; almostIncluded?: ApiCombo[] } };

function toCombo(c: ApiCombo, missing: string[] = []): Combo {
  return {
    id: c.id,
    cards: c.uses.map((u) => u.card.name),
    produces: c.produces.map((p) => p.feature.name).slice(0, 4),
    bracketTag: c.bracketTag ? BRACKET_TAG[c.bracketTag] ?? c.bracketTag : undefined,
    url: `https://commanderspellbook.com/combo/${c.id}/`,
    popularity: c.popularity,
    missing,
    steps: c.description?.trim() || undefined,
    requires: [c.easyPrerequisites, c.notablePrerequisites].filter((x) => x && x.trim()).join(" ").trim() || undefined,
    manaNeeded: c.manaValueNeeded,
  };
}

/**
 * Ids of Commander Spellbook's featured combos (the site's is:featured search), cached for a day.
 * Featured combos are ones Spellbook's editors highlight; the builder prefers them when it can
 * complete one from your collection. Best-effort: on any failure the set is just empty.
 */
async function featuredIds(): Promise<Set<string>> {
  const ids = await cached<string[]>("spellbook:featured", DAY, async () => {
    try {
      const out: string[] = [];
      let url: string | null = "https://backend.commanderspellbook.com/variants/?q=is%3Afeatured&limit=100";
      for (let page = 0; url && page < 5; page++) {
        const res: Response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "BulkBrew/0.1 (collection deck builder)" } });
        if (!res.ok) break;
        const j = (await res.json()) as { results?: { id: string }[]; next?: string | null };
        out.push(...(j.results ?? []).map((r) => r.id));
        url = j.next ?? null;
      }
      return out.length ? out : null;
    } catch {
      return null;
    }
  });
  return new Set(ids ?? []);
}

export async function findCombos(commanders: string[], cards: string[]): Promise<{ included: Combo[]; almost: Combo[] }> {
  const key = `spellbook:${hash([...commanders].sort().join("|") + "#" + [...cards].sort().join("|"))}`;
  const data = await cached<ApiResult>(key, DAY, async () => {
    try {
      const res = await fetch("https://backend.commanderspellbook.com/find-my-combos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "BulkBrew/0.1 (collection deck builder)" },
        body: JSON.stringify({ commanders: commanders.map((card) => ({ card })), main: cards.map((card) => ({ card })) }),
      });
      if (!res.ok) return null;
      return (await res.json()) as ApiResult;
    } catch {
      return null;
    }
  });
  const have = new Set([...commanders, ...cards].map((n) => n.toLowerCase()));
  const featured = data ? await featuredIds() : new Set<string>();
  const mark = (c: Combo) => (featured.has(c.id) ? { ...c, featured: true } : c);
  // Most-played first (Spellbook's popularity = EDHREC decks running the combo), featured ahead of ties.
  const order = (a: Combo, b: Combo) => (b.popularity ?? 0) - (a.popularity ?? 0) || Number(!!b.featured) - Number(!!a.featured);
  return {
    included: (data?.results?.included ?? []).map((c) => mark(toCombo(c))).sort(order),
    almost: (data?.results?.almostIncluded ?? []).map((c) => mark(toCombo(c, c.uses.map((u) => u.card.name).filter((n) => !have.has(n.toLowerCase()))))).sort(order),
  };
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/* ----------------------------- Bracket estimate ----------------------------- */

type EstimateResult = {
  bracketTag?: string | null;
  cards?: { card?: { name?: string }; banned?: boolean; gameChanger?: boolean; massLandDenial?: boolean; extraTurn?: boolean }[];
  combos?: {
    combo?: { uses?: { card?: { name?: string } }[] };
    relevant?: boolean; borderlineRelevant?: boolean; arguablyTwoCard?: boolean; definitelyTwoCard?: boolean;
    massLandDenial?: boolean; extraTurn?: boolean; lock?: boolean; skipTurns?: boolean; controlAllOpponents?: boolean;
  }[];
};

/**
 * Commander Spellbook's bracket estimator (POST /estimate-bracket). It classifies every card
 * (game changer, mass land denial, extra turn, banned) and every combo in the list (two-card or
 * not, locks, skipped turns), and gives an overall tag. We turn that into the official 1–5 scale:
 *   4: more than 3 game changers, mass land denial, a lock / skip-turns / control-everyone combo,
 *      or Spellbook's "Ruthless" tag;
 *   3: 1–3 game changers, or a two-card combo (Spellbook doesn't say how early, so we don't go
 *      higher on that alone), or "Powerful"/"Spicy";
 *   2: none of that (bracket 1 is about intent, which a list can't show).
 * Bracket 5 (cEDH) is a choice, not something a list proves, so the estimate stops at 4.
 * Returns null if Spellbook can't be reached.
 */
export async function estimateBracket(commanders: string[], cards: { name: string; quantity: number }[]): Promise<{ bracket: Bracket; tag?: string; reasons: string[] } | null> {
  const key = `spellbook:bracket:${hash([...commanders].sort().join("|") + "#" + cards.map((c) => c.name).sort().join("|"))}`;
  const r = await cached<EstimateResult>(key, DAY, async () => {
    try {
      const res = await fetch("https://backend.commanderspellbook.com/estimate-bracket", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "BulkBrew/0.1 (collection deck builder)" },
        body: JSON.stringify({ commanders: commanders.map((card) => ({ card, quantity: 1 })), main: cards.map((c) => ({ card: c.name, quantity: c.quantity })) }),
      });
      if (!res.ok) return null;
      return (await res.json()) as EstimateResult;
    } catch {
      return null;
    }
  });
  if (!r || (!r.cards && !r.combos && !r.bracketTag)) return null;

  const cardNames = (pred: (c: NonNullable<EstimateResult["cards"]>[number]) => boolean | undefined) => (r.cards ?? []).filter((c) => pred(c)).map((c) => c.card?.name ?? "?");
  const comboNames = (c: NonNullable<EstimateResult["combos"]>[number]) => (c.combo?.uses ?? []).map((u) => u.card?.name ?? "?").join(" + ");
  const gcs = cardNames((c) => c.gameChanger);
  const mld = cardNames((c) => c.massLandDenial);
  const extra = cardNames((c) => c.extraTurn);
  const banned = cardNames((c) => c.banned);
  const combos = (r.combos ?? []).filter((c) => c.relevant || c.borderlineRelevant);
  const twoCard = combos.filter((c) => c.definitelyTwoCard || c.arguablyTwoCard);
  const locks = combos.filter((c) => c.lock || c.skipTurns || c.controlAllOpponents);
  const tag = r.bracketTag ? BRACKET_TAG[r.bracketTag] ?? r.bracketTag : undefined;

  const reasons: string[] = [];
  let bracket = 2;
  const atLeast = (b: number, why: string) => { bracket = Math.max(bracket, b); reasons.push(why); };
  if (gcs.length > 3) atLeast(4, `${gcs.length} game changers (bracket 3 allows 3)`);
  else if (gcs.length) atLeast(3, `${gcs.length} game changer${gcs.length === 1 ? "" : "s"}: ${gcs.slice(0, 4).join(", ")}`);
  if (mld.length) atLeast(4, `mass land denial: ${mld.slice(0, 3).join(", ")}`);
  if (locks.length) atLeast(4, `lock or skip-turn combo: ${comboNames(locks[0])}`);
  if (twoCard.length) atLeast(3, `${twoCard.length} two-card combo${twoCard.length === 1 ? "" : "s"}, e.g. ${comboNames(twoCard[0])}`);
  if (extra.length) reasons.push(`extra-turn cards: ${extra.slice(0, 3).join(", ")} (fine below 4 as long as you don't chain them)`);
  if (r.bracketTag === "R") atLeast(4, "Commander Spellbook rates its combos Ruthless");
  else if ((r.bracketTag === "P" || r.bracketTag === "S") && bracket < 3) atLeast(3, `Commander Spellbook rates its combos ${tag}`);
  if (banned.length) reasons.unshift(`banned in Commander: ${banned.join(", ")}`);
  if (!reasons.length) reasons.push("no game changers, mass land denial, two-card combos or locks");
  return { bracket: bracket as Bracket, tag, reasons };
}

/** Replace a deck's game-changer-only bracket guess with Spellbook's, when it answers. */
export async function applyBracketEstimate(deck: Pick<BuiltDeck, "commanders" | "cards" | "stats" | "options">): Promise<void> {
  if (deck.options.format !== "commander" || !deck.commanders.length) return;
  const est = await estimateBracket(deck.commanders.map((c) => c.name), deck.cards.map((c) => ({ name: c.name, quantity: c.quantity })));
  if (est) {
    deck.stats.estimatedBracket = est.bracket;
    deck.stats.bracketEstimate = { source: "spellbook", tag: est.tag, reasons: est.reasons };
  } else {
    const gc = deck.stats.gameChangers.length;
    deck.stats.bracketEstimate = { source: "bulkbrew", reasons: [gc ? `${gc} game changer${gc === 1 ? "" : "s"}` : "no game changers", "Commander Spellbook was unreachable, so combos weren't counted"] };
  }
}
