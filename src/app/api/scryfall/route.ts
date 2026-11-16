import { backfillPrices, fetchCollection, fetchNamed, keyOf, normalizeCard, type Identifier } from "@/lib/scryfall";
import type { CardData } from "@/lib/types";

/**
 * POST { identifiers: Identifier[] }  →  { cards: Record<key, CardData>, notFound: Identifier[] }
 * The key for each card is the identifier that was sent, serialised, so the client can map back.
 * Max 75 identifiers per request (Scryfall limit). Called in chunks by the collection import.
 * `prices: false` skips the unpriced-printing backfill (the import does it once at the end).
 */
export async function POST(req: Request) {
  let body: { identifiers?: Identifier[]; prices?: boolean };
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
    // Two at a time: much quicker than one by one, and polite to Scryfall's 2 requests a second.
    const stillMissing: Identifier[] = [];
    const queue = [...res.not_found];
    const fuzzy = async () => {
      for (let ident = queue.shift(); ident; ident = queue.shift()) {
        const c = "name" in ident ? await fetchNamed(ident.name) : null;
        if (c) cards[keyOf(ident)] = normalizeCard(c);
        else stillMissing.push(ident);
      }
    };
    await Promise.all([fuzzy(), fuzzy()]);
    // Printings Scryfall has no price for (non-English, promos…): use the cheapest priced printing.
    if (body.prices !== false) await backfillPrices(Object.values(cards), { maxQueries: 6 });
    return Response.json({ cards, notFound: stillMissing });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Scryfall request failed" }, { status: 502 });
  }
}
