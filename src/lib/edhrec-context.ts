import type { EdhrecContext } from "./builder/heuristic";
import { EMPTY_EDHREC } from "./builder/heuristic";
import { edhrecCommander, edhrecForTheme } from "./edhrec";
import type { BuildOptions } from "./types";

const THEME_SLUG: Partial<Record<string, string>> = {
  artifacts: "artifacts", enchantments: "enchantments", counters: "counters", tokens: "tokens", spellslinger: "spellslinger",
  graveyard: "reanimator", aristocrats: "aristocrats", lifegain: "lifegain", voltron: "voltron", blink: "blink",
  landfall: "landfall", control: "control", aggro: "aggro", combo: "combo", mill: "mill", stax: "stax", wheels: "wheels", burn: "burn",
};

/** Gather the EDHREC signal for a build: commander page (narrowed by tag), average deck, or a theme page. */
export async function edhrecContextFor(opts: BuildOptions): Promise<EdhrecContext> {
  if (!opts.useEdhrec) return EMPTY_EDHREC;
  try {
    if (opts.commander) {
      const tag = opts.edhrecTag ?? (opts.tribe ? `${opts.tribe.toLowerCase()}s` : opts.themes.map((t) => THEME_SLUG[t]).find(Boolean));
      const info = await edhrecCommander(opts.commander, opts.partner, tag);
      if (!info) return EMPTY_EDHREC;
      const tagLabel = info.tagUsed ? info.tags.find((t) => t.slug === info.tagUsed)?.label ?? info.tagUsed : undefined;
      const short = info.name.split(",")[0].split(" // ")[0];
      return { cards: info.cards, averageDeck: info.averageDeck, profile: info.profile, commanderDecks: info.decks, commanderName: short, tagLabel };
    }
    const slug = opts.themes.map((t) => THEME_SLUG[t]).find(Boolean);
    if (slug) return { ...EMPTY_EDHREC, cards: await edhrecForTheme(slug) };
  } catch {
    /* fall through */
  }
  return EMPTY_EDHREC;
}
