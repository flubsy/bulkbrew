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

  // Extra ways to win: combos the list is one or two owned cards away from (pieces on the bench).
  // Brackets 1–2 allow no combos, bracket 3 no two-card ones; 4–5 take anything.
  const bracket = opts.bracket ?? 3;
  if (deck.commanders.length && bracket >= 3 && opts.format === "commander") {
    try {
      const lower = (s: string) => s.toLowerCase();
      const inDeck = new Set([...deck.cards, ...deck.commanders].map((c) => lower(c.name)));
      const bench = new Set(deck.alternatives.map((c) => lower(c.name)));
      const found = await findCombos(deck.commanders.map((c) => c.name), [...deck.cards.filter((c) => c.role !== "land").map((c) => c.name), ...deck.alternatives.map((c) => c.name)]);
      const options = found.included
        .filter((c) => bracket >= 4 || c.cards.length >= 3)
        .map((c) => ({ c, need: c.cards.filter((n) => !inDeck.has(lower(n))) }))
        .filter((x) => x.need.length > 0 && x.need.length <= 2 && x.need.every((n) => bench.has(lower(n))))
        .sort((a, b) => a.need.length - b.need.length || (b.c.popularity ?? 0) - (a.c.popularity ?? 0));
      const picked = options.slice(0, bracket >= 4 ? 2 : 1);
      const need = [...new Set(picked.flatMap((p) => p.need))];
      if (need.length) {
        const rebuilt = buildHeuristic(pool, { ...opts, includeCards: [...opts.includeCards, ...need] }, refs, ed);
        for (const p of picked) {
          const why = `Combo piece: with ${p.c.cards.filter((n) => !p.need.includes(n)).join(" + ")} → ${p.c.produces.slice(0, 2).join(", ").toLowerCase()}`;
          for (const e of rebuilt.cards) if (p.need.includes(e.name)) e.reason = why;
        }
        rebuilt.notes.push(`Combos: added ${need.join(", ")} from your collection to complete ${picked.map((p) => p.c.cards.join(" + ")).join("; ")}, as an extra way to win.`);
        rebuilt.warnings.push(...deck.warnings.filter((w) => !rebuilt.warnings.includes(w)));
        deck = rebuilt;
      }
    } catch { /* Spellbook unreachable: keep the first build */ }
  }

  if (opts.useAI) {
    if (!aiAvailable()) {
      deck.warnings.push("AI pass skipped: AI is off on this server (no ANTHROPIC_API_KEY, or BULKBREW_DISABLE_AI is set).");
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

    if (bracket <= 2 && combos.included.length) deck.warnings.push(`This list contains ${combos.included.length} combo(s), which bracket ${bracket} doesn't allow. See the combos panel and cut a piece.`);
  }

  deck.stats.power = ratePower(deck, { combos: deck.combos });
  deck.primer = buildPrimer(deck, cmdCards.filter((c): c is NonNullable<typeof c> => !!c), ed.tagLabel);
  return Response.json({ deck: withImages(deck), aiAvailable: aiAvailable() });
}
