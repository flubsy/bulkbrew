import { readJson } from "@/lib/read-body";
import { computeStats, sortDeck } from "@/lib/builder/heuristic";
import { ratePower } from "@/lib/builder/power";
import { buildPrimer } from "@/lib/builder/primer";
import { classifyCard } from "@/lib/builder/roles";
import { fetchNamed, normalizeCard, withImages } from "@/lib/scryfall";
import { findCombos } from "@/lib/spellbook";
import type { BuiltDeck, CardData, DeckEntry } from "@/lib/types";

export const maxDuration = 60;

/**
 * POST { deck, cards? } → { deck }
 * Recomputes a hand-edited deck: roles for cards added from the collection (their Scryfall data
 * comes in `cards`), then stats, combos, power and the primer. Nothing is swapped or added here.
 */
export async function POST(req: Request) {
  let body: { deck?: BuiltDeck; cards?: CardData[] };
  try {
    body = await readJson(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const deck = body.deck;
  if (!deck?.cards) return Response.json({ error: "No deck" }, { status: 400 });

  const added = new Map((body.cards ?? []).map((c) => [c.name.toLowerCase(), c]));
  const cards: DeckEntry[] = deck.cards.map((e) => {
    const c = added.get(e.name.toLowerCase());
    if (!c) return e;
    return {
      ...e,
      role: classifyCard(c).role,
      cmc: c.cmc,
      typeLine: c.typeLine,
      manaCost: c.manaCost,
      priceUsd: e.priceUsd ?? c.priceUsd,
      scryfallId: e.scryfallId ?? c.scryfallId,
      gameChanger: c.gameChanger || undefined,
    };
  });

  const out: BuiltDeck = { ...deck, cards: sortDeck(cards) };
  const gc = out.cards.filter((c) => c.gameChanger).length;
  out.stats = { ...computeStats(out.cards, out.commanders, deck.options.bracket ?? 3, gc), power: undefined };

  const commanders: CardData[] = [];
  try {
    for (const c of deck.commanders) {
      const found = await fetchNamed(c.name);
      if (found) commanders.push(normalizeCard(found));
    }
  } catch { /* Scryfall unreachable: the primer is written without commander text */ }

  if (deck.commanders.length) {
    try {
      out.combos = (await findCombos(deck.commanders.map((c) => c.name), out.cards.filter((c) => c.role !== "land").map((c) => c.name))).included.slice(0, 12);
    } catch { /* Spellbook unreachable: keep the combos we had, minus ones that lost a piece */
      const names = new Set([...out.cards, ...out.commanders].map((c) => c.name.toLowerCase()));
      out.combos = (deck.combos ?? []).filter((k) => k.cards.every((n) => names.has(n.toLowerCase())));
    }
  }
  out.stats.power = ratePower(out, { combos: out.combos });
  out.primer = buildPrimer(out, commanders);
  return Response.json({ deck: withImages(out) });
}
