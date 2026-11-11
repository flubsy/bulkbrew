import type { ThemeId } from "./types";

/**
 * Map EDHREC's deck tags (what players label their decks with) onto Deckbit's themes.
 * Tribal tags ("dragons", "elves") are matched against real creature types.
 * Tags with no theme equivalent (e.g. "treasure", "flying") are still used: they narrow the
 * EDHREC data the builder pulls (cards played in decks with that tag).
 */

const TAG_THEME: Record<string, ThemeId> = {
  tokens: "tokens", "go-wide": "tokens",
  counters: "counters", "plus-1-plus-1-counters": "counters", "p1p1-counters": "counters", proliferate: "counters",
  artifacts: "artifacts", "artifact-tokens": "artifacts",
  enchantments: "enchantments", enchantress: "enchantments", constellation: "enchantments",
  auras: "voltron", equipment: "voltron", voltron: "voltron",
  spellslinger: "spellslinger", "spells-matter": "spellslinger", storm: "spellslinger", "cast-triggers": "spellslinger",
  reanimator: "graveyard", graveyard: "graveyard", "self-mill": "graveyard", dredge: "graveyard",
  aristocrats: "aristocrats", sacrifice: "aristocrats",
  lifegain: "lifegain", "life-gain": "lifegain",
  blink: "blink", flicker: "blink", etb: "blink",
  landfall: "landfall", lands: "landfall", "lands-matter": "landfall",
  control: "control", aggro: "aggro", combo: "combo", mill: "mill", stax: "stax",
  ramp: "ramp", "big-mana": "ramp", "x-spells": "ramp",
  wheels: "wheels", discard: "wheels", madness: "wheels",
  burn: "burn", "group-slug": "burn", pingers: "burn",
};

const IRREGULAR: Record<string, string> = {
  elves: "Elf", dwarves: "Dwarf", wolves: "Wolf", werewolves: "Werewolf", mice: "Mouse", fungi: "Fungus",
  "fungus-saprolings": "Fungus", humans: "Human", merfolk: "Merfolk", sphinxes: "Sphinx", foxes: "Fox",
  octopuses: "Octopus", leeches: "Leech", "elder-dragons": "Dragon", "kor": "Kor", "sliver": "Sliver",
};

/** Resolve an EDHREC tag slug to a theme and/or a creature type, given the creature types the user owns. */
export function mapEdhrecTag(slug: string, knownTypes: string[]): { themes: ThemeId[]; tribe?: string } {
  const theme = TAG_THEME[slug];
  if (theme) return { themes: [theme] };
  const lower = new Map(knownTypes.map((t) => [t.toLowerCase(), t] as const));
  const tries = [IRREGULAR[slug]?.toLowerCase(), slug, slug.replace(/s$/, ""), slug.replace(/es$/, ""), slug.replace(/ies$/, "y")].filter(Boolean) as string[];
  for (const t of tries) {
    const hit = lower.get(t);
    if (hit) return { themes: ["tribal"], tribe: hit };
  }
  return { themes: [] };
}
