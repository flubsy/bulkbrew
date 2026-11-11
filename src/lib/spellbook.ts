import { cached, DAY } from "./server-cache";
import type { Combo } from "./types";

/**
 * Commander Spellbook (commanderspellbook.com) combo finder. Free, public, no key.
 * POST a card list, get back combos fully included and combos one card away.
 */

const BRACKET_TAG: Record<string, string> = {
  R: "Ruthless",
  S: "Spicy",
  P: "Powerful",
  O: "Oddball",
  C: "Casual",
  E: "Exhibition",
  B: "Bracket-friendly",
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
  };
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
  return {
    included: (data?.results?.included ?? []).map((c) => toCombo(c)),
    almost: (data?.results?.almostIncluded ?? []).map((c) => toCombo(c, c.uses.map((u) => u.card.name).filter((n) => !have.has(n.toLowerCase())))),
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
