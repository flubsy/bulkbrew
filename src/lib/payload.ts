import { FORMATS, type CardData, type Format } from "./types";

/**
 * Keep collection uploads small. Vercel rejects request bodies over 4.5 MB, and a big
 * collection sent as raw OwnedCard rows (every printing, image URLs, full legalities) blows past
 * that. So before sending we:
 *   1. collapse printings into one row per card name (quantity summed, sets kept),
 *   2. drop fields the server never reads (image URLs are rebuilt from the Scryfall id),
 *   3. gzip the JSON (see postJson).
 */

export interface PackedCard {
  card: CardData;
  quantity: number;
  sets: string[];
}

/** Only the fields the build/upgrade engine reads. */
export function slimCard(c: CardData, format?: Format): CardData {
  const key = format ? FORMATS.find((f) => f.id === format)?.scryfall : undefined;
  return {
    scryfallId: c.scryfallId,
    name: c.name,
    setCode: c.setCode,
    manaCost: c.manaCost,
    cmc: c.cmc,
    typeLine: c.typeLine,
    oracleText: c.oracleText,
    colors: c.colors,
    colorIdentity: c.colorIdentity,
    keywords: c.keywords,
    producedMana: c.producedMana,
    layout: c.layout,
    legalities: key ? { [key]: c.legalities[key] } : {},
    priceUsd: c.priceUsd,
    edhrecRank: c.edhrecRank,
    gameChanger: c.gameChanger,
    releasedAt: c.releasedAt,
  } as CardData;
}

export function packCollection(owned: { card?: CardData; quantity: number }[], format?: Format): PackedCard[] {
  const byName = new Map<string, PackedCard>();
  for (const o of owned) {
    if (!o.card) continue;
    const hit = byName.get(o.card.name);
    if (hit) {
      hit.quantity += o.quantity;
      if (!hit.sets.includes(o.card.setCode)) hit.sets.push(o.card.setCode);
      // Keep the cheapest printing's price, like the server's pool does.
      if (o.card.priceUsd !== null && (hit.card.priceUsd === null || o.card.priceUsd < hit.card.priceUsd)) hit.card = { ...hit.card, priceUsd: o.card.priceUsd };
    } else {
      byName.set(o.card.name, { card: slimCard(o.card, format), quantity: o.quantity, sets: [o.card.setCode] });
    }
  }
  return [...byName.values()];
}

/**
 * POST JSON, gzipped when large (header X-Body-Encoding: gzip; the route decompresses).
 * Always returns parsed JSON or throws a readable error — never "Unexpected token" on a plain-text
 * error page from the host.
 */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const json = JSON.stringify(body);
  let init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: json };
  if (json.length > 50_000 && typeof CompressionStream !== "undefined") {
    const gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    init = { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Body-Encoding": "gzip" }, body: gz };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    if (res.status === 413) throw new Error("Your collection is too large to send in one go. Try a narrower build (pick a commander or colours first) and tell the developer.");
    if (res.status === 504) throw new Error("The server took too long. Try again; the second run is faster because EDHREC data is cached.");
    throw new Error(`Server error ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}
