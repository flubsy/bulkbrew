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
