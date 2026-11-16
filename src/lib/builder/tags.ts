import tagsData from "@/data/tags.json";

/**
 * Extra Scryfall Tagger function tags (src/data/tags.json, built by `npm run roles`): mana dorks,
 * sacrifice outlets, token makers, alternate wins and so on. Hand-curated by the Tagger community,
 * so far more accurate than rules-text patterns. Everything that uses them falls back to the
 * patterns when the file is empty or a card isn't tagged.
 * Server-only: the JSON is large, so never import this from a client component.
 */

export type TagKey =
  | "manaDork" | "manaRock" | "sacOutlet" | "deathTrigger" | "altWin" | "winCon" | "tokenMaker" | "treasureMaker"
  | "anthem" | "massPump" | "drain" | "burn" | "lifegain" | "extraCombat" | "mill" | "selfMill" | "reanimate" | "flicker"
  | "costReducer" | "ritual" | "copySpell" | "spellsMatter" | "untapper" | "evasion" | "haste" | "counterPlacer" | "cardAdvantage";

type TagsFile = { generatedAt: string | null; slugs: Record<string, string>; tags: Partial<Record<TagKey, string[]>> };
const data = tagsData as TagsFile;

const byName = new Map<string, Set<TagKey>>();
for (const [key, names] of Object.entries(data.tags) as [TagKey, string[]][]) {
  for (const n of names) {
    const k = n.toLowerCase();
    const set = byName.get(k) ?? new Set<TagKey>();
    set.add(key);
    byName.set(k, set);
    if (k.includes(" // ")) byName.set(k.split(" // ")[0], set);
  }
}

const EMPTY = new Set<TagKey>();

/** The extra tags on a card (empty set when untagged or the data file hasn't been built). */
export function cardTags(name: string): ReadonlySet<TagKey> {
  return byName.get(name.toLowerCase()) ?? byName.get(name.split(" // ")[0].toLowerCase()) ?? EMPTY;
}

export const TAGS_GENERATED_AT = data.generatedAt;
export const TAGS_LOADED = byName.size > 0;
