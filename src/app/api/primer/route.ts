import { buildPrimer } from "@/lib/builder/primer";
import { cardsByName, fetchNamed, normalizeCard } from "@/lib/scryfall";
import { findCombos } from "@/lib/spellbook";
import type { BuiltDeck, CardData } from "@/lib/types";

/** POST { deck: BuiltDeck } → { primer, combos } — for saved decks made before primers existed. */
export async function POST(req: Request) {
  let body: { deck?: BuiltDeck };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const deck = body.deck;
  if (!deck?.cards?.length) return Response.json({ error: "No deck" }, { status: 400 });

  const commanders: CardData[] = [];
  for (const c of deck.commanders) {
    const found = await fetchNamed(c.name);
    if (found) commanders.push(normalizeCard(found));
  }
  const combos = deck.commanders.length
    ? (await findCombos(deck.commanders.map((c) => c.name), deck.cards.filter((c) => c.role !== "land").map((c) => c.name))).included.slice(0, 12)
    : deck.combos ?? [];
  // Card text for the "how it wins" section (what kind of finisher each card is, enablers…).
  const cardData = await cardsByName(deck.cards.filter((c) => c.role !== "land").map((c) => c.name));
  const primer = buildPrimer({ ...deck, combos }, commanders, undefined, cardData);
  return Response.json({ primer, combos });
}
