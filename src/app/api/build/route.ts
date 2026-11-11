import { readJson } from "@/lib/read-body";
import { withImages } from "@/lib/scryfall";
import { aiAvailable, refineWithAI } from "@/lib/builder/ai";
import { buildHeuristic, buildPool, scorePool } from "@/lib/builder/heuristic";
import { ratePower } from "@/lib/builder/power";
import { buildPrimer } from "@/lib/builder/primer";
import { edhrecContextFor } from "@/lib/edhrec-context";
import { findCombos } from "@/lib/spellbook";
import type { BuildOptions, CardData, ReferenceDeck } from "@/lib/types";

export const maxDuration = 300;

interface BuildRequest {
  options: BuildOptions;
  owned: { card: CardData; quantity: number; sets?: string[] }[];
  refs: ReferenceDeck[];
}

/** POST BuildRequest → { deck: BuiltDeck, aiAvailable: boolean } */
export async function POST(req: Request) {
  let body: BuildRequest;
  try {
    body = await readJson(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.options || !Array.isArray(body.owned)) return Response.json({ error: "Missing options or collection." }, { status: 400 });
  if (!body.owned.length) return Response.json({ error: "Your collection is empty. Import it first." }, { status: 400 });

  const pool = buildPool(body.owned);
  const refs = body.refs ?? [];
  const opts = body.options;

  const cmdCards = [opts.commander, opts.partner].filter(Boolean).map((n) => pool.find((p) => p.card.name.toLowerCase() === n!.toLowerCase())?.card).filter((c) => !!c);
  const ci = cmdCards.length ? [...new Set(cmdCards.flatMap((c) => c!.colorIdentity))] : opts.colors;
  const ed = await edhrecContextFor(opts, { ci, commanderReleased: cmdCards[0]?.releasedAt });
  let deck = buildHeuristic(pool, opts, refs, ed);
  if (opts.useEdhrec && !ed.cards.length) deck.warnings.push("EDHREC returned nothing for this commander/theme (or was unreachable). Built without it.");

  if (opts.useAI) {
    if (!aiAvailable()) {
      deck.warnings.push("AI pass skipped: AI is off on this server (no ANTHROPIC_API_KEY, or DECKBIT_DISABLE_AI is set).");
    } else {
      try {
        const commanders = deck.commanders.map((c) => pool.find((p) => p.card.name === c.name)!.card);
        const { candidates } = scorePool(pool, opts, refs, commanders, ed);
        deck = await refineWithAI(deck, candidates, opts, refs);
      } catch (e) {
        deck.warnings.push(`AI pass failed: ${e instanceof Error ? e.message : "unknown error"}. Showing the rules-engine build.`);
      }
    }
  }

  // Combos actually in the finished list (Commander Spellbook).
  if (deck.commanders.length) {
    const combos = await findCombos(deck.commanders.map((c) => c.name), deck.cards.filter((c) => c.role !== "land").map((c) => c.name));
    deck.combos = combos.included.slice(0, 12);
    const bracket = opts.bracket ?? 3;
    if (bracket <= 2 && combos.included.length) deck.warnings.push(`This list contains ${combos.included.length} combo(s), which bracket ${bracket} doesn't allow. See the combos panel and cut a piece.`);
  }

  deck.stats.power = ratePower(deck, { combos: deck.combos });
  deck.primer = buildPrimer(deck, cmdCards.filter((c): c is NonNullable<typeof c> => !!c), ed.tagLabel);
  return Response.json({ deck: withImages(deck), aiAvailable: aiAvailable() });
}
