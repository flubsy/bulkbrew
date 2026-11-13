import type { EdhrecContext } from "./builder/heuristic";
import { EMPTY_EDHREC } from "./builder/heuristic";
import { edhrecCommander, edhrecForTag } from "./edhrec";
import type { BuildOptions } from "./types";

const THEME_SLUG: Partial<Record<string, string>> = {
  artifacts: "artifacts", enchantments: "enchantments", counters: "counters", tokens: "tokens", spellslinger: "spellslinger",
  graveyard: "reanimator", aristocrats: "aristocrats", lifegain: "lifegain", voltron: "voltron", blink: "blink",
  landfall: "landfall", control: "control", aggro: "aggro", combo: "combo", mill: "mill", stax: "stax", wheels: "wheels", burn: "burn",
};

/**
 * Gather the EDHREC signal for a build:
 *  - the commander's page (narrowed by tag) and its average deck, and
 *  - the archetype page for that tag across ALL commanders in the same colours
 *    ("how good is this card in Grixis spellslinger decks generally").
 * Without a commander, the archetype page is all we use.
 */
export async function edhrecContextFor(opts: BuildOptions, extra: { ci?: string[]; commanderReleased?: string } = {}): Promise<EdhrecContext> {
  if (!opts.useEdhrec) return EMPTY_EDHREC;
  const tag = opts.edhrecTag ?? (opts.tribe ? `${opts.tribe.toLowerCase()}s` : opts.themes.map((t) => THEME_SLUG[t]).find(Boolean));
  try {
    const archetypeP = tag ? edhrecForTag(tag, extra.ci).catch(() => []) : Promise.resolve([]);
    if (opts.commander) {
      const [info, archetype] = await Promise.all([edhrecCommander(opts.commander, opts.partner, tag, opts.format === "commander" ? opts.bracket : undefined), archetypeP]);
      if (!info) return { ...EMPTY_EDHREC, archetype };
      const tagLabel = info.tagUsed ? info.tags.find((t) => t.slug === info.tagUsed)?.label ?? info.tagUsed : undefined;
      const short = info.name.split(",")[0].split(" // ")[0];
      return {
        cards: info.cards,
        averageDeck: info.averageDeck,
        profile: info.profile,
        commanderDecks: info.decks,
        commanderName: short,
        tagLabel,
        archetype,
        archetypeLabel: tag ? tagLabel ?? tag.replace(/-/g, " ") : undefined,
        commanderReleased: extra.commanderReleased,
      };
    }
    const archetype = await archetypeP;
    if (archetype.length) return { ...EMPTY_EDHREC, cards: archetype };
  } catch {
    /* fall through */
  }
  return EMPTY_EDHREC;
}
