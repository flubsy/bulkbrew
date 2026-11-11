import type { CardData, Color } from "./types";

/**
 * Scryfall helpers. The server route batches /cards/collection calls (75 identifiers max,
 * ~10 requests/second). Scryfall asks for a descriptive User-Agent and an Accept header.
 */

export const SCRYFALL_HEADERS = {
  "User-Agent": "Deckbit/0.1 (collection deck builder; local app)",
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
  prices?: { usd?: string | null; usd_foil?: string | null; eur?: string | null };
  edhrec_rank?: number;
  game_changer?: boolean;
  released_at?: string;
  card_faces?: ScryfallFace[];
};

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
    priceUsd: c.prices?.usd ? parseFloat(c.prices.usd) : null,
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
