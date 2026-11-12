import { backfillPrices, fetchCollection, fetchNamed, keyOf, normalizeCard, type Identifier } from "@/lib/scryfall";
import type { CardData } from "@/lib/types";

/**
 * POST { identifiers: Identifier[] }  →  { cards: Record<key, CardData>, notFound: Identifier[] }
 * The key for each card is the identifier that was sent, serialised, so the client can map back.
 * Max 75 identifiers per request (Scryfall limit). Called in chunks by the collection page.
 */
export async function POST(req: Request) {
  let body: { identifiers?: Identifier[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const identifiers = (body.identifiers ?? []).slice(0, 75);
  if (!identifiers.length) return Response.json({ cards: {}, notFound: [] });

  try {
    const res = await fetchCollection(identifiers);
    const cards: Record<string, CardData> = {};
    // Scryfall returns found cards in request order, skipping not-found ones.
    const notFoundKeys = new Set(res.not_found.map(keyOf));
    let i = 0;
    for (const ident of identifiers) {
      const k = keyOf(ident);
      if (notFoundKeys.has(k)) continue;
      const c = res.data[i++];
      if (c) cards[k] = normalizeCard(c);
    }
    // Fuzzy fallback for name-only misses (typos, "Jace, the Mind Sculptor" vs curly quotes etc).
    const stillMissing: Identifier[] = [];
    for (const ident of res.not_found) {
      if ("name" in ident) {
        const c = await fetchNamed(ident.name);
        if (c) { cards[keyOf(ident)] = normalizeCard(c); continue; }
      }
      stillMissing.push(ident);
    }
    // Printings Scryfall has no price for (non-English, promos…): use the cheapest priced printing.
    await backfillPrices(Object.values(cards), { maxQueries: 6 });
    return Response.json({ cards, notFound: stillMissing });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Scryfall request failed" }, { status: 502 });
  }
}
