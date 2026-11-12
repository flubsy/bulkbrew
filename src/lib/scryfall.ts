import type { CardData, Color } from "./types";

/**
 * Scryfall helpers. The server route batches /cards/collection calls (75 identifiers max,
 * ~10 requests/second). Scryfall asks for a descriptive User-Agent and an Accept header.
 */

export const SCRYFALL_HEADERS = {
  "User-Agent": "BulkBrew/0.1 (collection deck builder; local app)",
  Accept: "application/json",
};

export type Identifier = { id: string } | { name: string; set: string } | { name: string } | { set: string; collector_number: string };

type ScryfallFace = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: Color[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { small?: string; normal?: string };
};

export type ScryfallCard = ScryfallFace & {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  cmc?: number;
  color_identity?: Color[];
  keywords?: string[];
  produced_mana?: string[];
  layout: string;
  legalities: Record<string, string>;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null; eur?: string | null; eur_foil?: string | null };
  edhrec_rank?: number;
  game_changer?: boolean;
  released_at?: string;
  card_faces?: ScryfallFace[];
};

const num = (s?: string | null) => (s ? parseFloat(s) : NaN);

/**
 * A USD price for one printing. Scryfall leaves `usd` empty for foil-only and etched-only printings
 * (the price is in usd_foil / usd_etched) and for EU-only printings (only eur). Fall back in that
 * order; EUR is converted at a rough rate. Printings with no price at all (non-English, promos,
 * digital) stay null and are filled by backfillPrices().
 */
function bestPrice(p: ScryfallCard["prices"]): number | null {
  for (const v of [num(p?.usd), num(p?.usd_foil), num(p?.usd_etched)]) if (Number.isFinite(v)) return v;
  const eur = num(p?.eur) || num(p?.eur_foil);
  return Number.isFinite(eur) && eur > 0 ? Math.round((eur / 0.87) * 100) / 100 : null;
}

/**
 * Server-side: fill priceUsd for cards whose printing has no price, using the cheapest priced
 * printing of the same card (Scryfall search: oracleid:… usd>0 prefer:usd-low). Mutates the cards.
 * The usual culprits are non-English printings (Scryfall has no prices for them), promos and
 * MTGO/Arena-only versions.
 */
export async function backfillPrices(cards: CardData[], opts: { maxQueries?: number } = {}): Promise<number> {
  const missing = new Map<string, CardData[]>();
  for (const c of cards) {
    if (c.priceUsd != null || !c.oracleId || isBasic(c.name)) continue;
    const list = missing.get(c.oracleId);
    if (list) list.push(c);
    else missing.set(c.oracleId, [c]);
  }
  const ids = [...missing.keys()];
  const prices = await cheapestPrices(ids, opts.maxQueries ?? 20);
  let fixed = 0;
  for (const [id, price] of prices) for (const c of missing.get(id) ?? []) { c.priceUsd = price; fixed++; }
  return fixed;
}

/** oracle id → cheapest USD price across printings. 15 ids per search, one search per 100 ms. */
export async function cheapestPrices(oracleIds: string[], maxQueries = 20): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = oracleIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  for (let i = 0, n = 0; i < ids.length && n < maxQueries; i += 15, n++) {
    const chunk = ids.slice(i, i + 15);
    const q = `(${chunk.map((id) => `oracleid:${id}`).join(" or ")}) usd>0 prefer:usd-low`;
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(q)}`, { headers: SCRYFALL_HEADERS });
      if (res.status === 429) { await sleep(1200); i -= 15; continue; }
      if (res.ok) {
        const j = (await res.json()) as { data?: ScryfallCard[] };
        for (const c of j.data ?? []) {
          const p = bestPrice(c.prices);
          if (c.oracle_id && p != null) out.set(c.oracle_id, p);
        }
      }
    } catch { /* network: leave these unpriced */ }
    await sleep(100);
  }
  return out;
}

export function normalizeCard(c: ScryfallCard): CardData {
  const face = c.card_faces?.[0];
  const allOracle = c.card_faces?.map((f) => f.oracle_text ?? "").filter(Boolean).join("\n//\n") || c.oracle_text || "";
  const img = c.image_uris ?? face?.image_uris;
  return {
    scryfallId: c.id,
    oracleId: c.oracle_id ?? c.id,
    name: c.name,
    setCode: c.set,
    setName: c.set_name,
    collectorNumber: c.collector_number,
    rarity: c.rarity,
    manaCost: c.mana_cost ?? face?.mana_cost ?? "",
    cmc: c.cmc ?? 0,
    typeLine: c.type_line ?? face?.type_line ?? "",
    oracleText: allOracle,
    colors: c.colors ?? face?.colors ?? [],
    colorIdentity: c.color_identity ?? [],
    keywords: c.keywords ?? [],
    producedMana: c.produced_mana ?? [],
    power: c.power ?? face?.power,
    toughness: c.toughness ?? face?.toughness,
    loyalty: c.loyalty ?? face?.loyalty,
    layout: c.layout,
    legalities: c.legalities ?? {},
    priceUsd: bestPrice(c.prices),
    priceUsdFoil: c.prices?.usd_foil ? parseFloat(c.prices.usd_foil) : null,
    edhrecRank: c.edhrec_rank ?? null,
    gameChanger: !!c.game_changer,
    imageSmall: img?.small,
    imageNormal: img?.normal,
    releasedAt: c.released_at,
  };
}

/** Stable string key for an identifier, used to map Scryfall results back to rows. */
export function keyOf(i: Identifier): string {
  if ("id" in i) return `id:${i.id}`;
  if ("collector_number" in i) return `cn:${i.set}:${i.collector_number}`;
  if ("set" in i) return `ns:${i.name.toLowerCase()}:${i.set}`;
  return `n:${i.name.toLowerCase()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Server-side: resolve up to 75 identifiers in one Scryfall call. */
export async function fetchCollection(identifiers: Identifier[]): Promise<{ data: ScryfallCard[]; not_found: Identifier[] }> {
  const res = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { ...SCRYFALL_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers }),
  });
  if (res.status === 429) {
    await sleep(1200);
    return fetchCollection(identifiers);
  }
  if (!res.ok) throw new Error(`Scryfall ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Server-side: resolve a list of exact names (fuzzy per-card fallback for odd spellings). */
export async function fetchNamed(name: string): Promise<ScryfallCard | null> {
  const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers: SCRYFALL_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

export function manaPips(manaCost: string): Record<Color, number> {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const m of manaCost.matchAll(/\{([^}]+)\}/g)) {
    for (const c of m[1].split("/")) {
      if (c in pips) pips[c as Color]++;
    }
  }
  return pips;
}

export const BASIC_LANDS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
export const BASIC_NAMES = new Set([...Object.values(BASIC_LANDS), "Wastes", "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"]);
export const isBasic = (name: string) => BASIC_NAMES.has(name);

/**
 * Scryfall image URL from a card id. The ?timestamp Scryfall appends is only cache-busting, so the
 * bare path works. Lets the client skip sending image URLs with every card.
 */
export function scryfallImage(id: string, size: "small" | "normal"): string {
  return `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg`;
}

/** Fill in missing image URLs on every entry of a built deck (commanders, list, bench, swaps). */
export function withImages<T extends { commanders: DeckEntryLike[]; cards: DeckEntryLike[]; alternatives?: DeckEntryLike[]; upgrade?: { swaps: { in: DeckEntryLike; out: DeckEntryLike }[] } }>(deck: T): T {
  const fix = (e: DeckEntryLike) => {
    if (e.scryfallId && !e.imageSmall) e.imageSmall = scryfallImage(e.scryfallId, "small");
    if (e.scryfallId && !e.imageNormal) e.imageNormal = scryfallImage(e.scryfallId, "normal");
  };
  deck.commanders.forEach(fix);
  deck.cards.forEach(fix);
  deck.alternatives?.forEach(fix);
  deck.upgrade?.swaps.forEach((sw) => { fix(sw.in); fix(sw.out); });
  return deck;
}

type DeckEntryLike = { scryfallId?: string; imageSmall?: string; imageNormal?: string };
