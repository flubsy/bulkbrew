import { db } from "./db";
import type { CardData, OwnedCard } from "./types";

/**
 * Editing the local collection. Every write goes through Dexie, so the sync hooks mark rows
 * dirty and queue tombstones for deletions on their own.
 *
 * Row ids: the Scryfall id of the printing, plus ":foil" for foil copies (older rows imported
 * before this split keep the bare id even when foil).
 */
export function ownedId(scryfallId: string, foil?: boolean): string {
  return foil ? `${scryfallId}:foil` : scryfallId;
}

export const isBasicLand = (c?: CardData) => !!c && /^Basic.*Land/.test(c.typeLine.split("//")[0]);

/** Staples: game changers and the cards played in the most Commander decks (EDHREC rank). */
export const STAPLE_RANK = 400;
export const isStaple = (c?: CardData) => !!c && !isBasicLand(c) && (c.gameChanger || (c.edhrecRank != null && c.edhrecRank <= STAPLE_RANK));

export interface CardGroup {
  key: string;
  name: string;
  card?: CardData;
  rows: OwnedCard[];
  qty: number;
  value: number;
  priceMin: number | null;
  priceMax: number | null;
  basic: boolean;
}

/** One group per card (oracle id), holding every printing the user owns. */
export function groupOwned(rows: OwnedCard[]): CardGroup[] {
  const map = new Map<string, CardGroup>();
  for (const r of rows) {
    const key = r.card?.oracleId ?? `name:${r.name.toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = { key, name: r.card?.name ?? r.name, card: r.card, rows: [], qty: 0, value: 0, priceMin: null, priceMax: null, basic: isBasicLand(r.card) };
      map.set(key, g);
    }
    g.rows.push(r);
    g.qty += r.quantity;
    const p = unitPrice(r);
    if (p != null) {
      g.value += p * r.quantity;
      g.priceMin = g.priceMin == null ? p : Math.min(g.priceMin, p);
      g.priceMax = g.priceMax == null ? p : Math.max(g.priceMax, p);
    }
  }
  for (const g of map.values()) g.rows.sort((a, b) => (b.card?.releasedAt ?? "").localeCompare(a.card?.releasedAt ?? "") || b.quantity - a.quantity);
  return [...map.values()];
}

/** Price of one copy: the foil price for foil copies when Scryfall has one. */
export function unitPrice(r: OwnedCard): number | null {
  if (!r.card) return null;
  if (r.foil && r.card.priceUsdFoil != null) return r.card.priceUsdFoil;
  return r.card.priceUsd;
}

export async function setQuantity(row: OwnedCard, quantity: number) {
  if (quantity <= 0) await db.owned.delete(row.id);
  else await db.owned.update(row.id, { quantity });
}

export async function removeRows(rows: OwnedCard[]) {
  await db.owned.bulkDelete(rows.map((r) => r.id));
}

/** Put deleted rows back (undo). */
export async function restoreRows(rows: OwnedCard[]) {
  await db.owned.bulkPut(rows);
}

/**
 * Move `count` copies of a row to another printing and/or finish. Merges into a row that
 * already holds that printing; the original row shrinks or goes.
 */
export async function movePrinting(row: OwnedCard, card: CardData, foil: boolean, count = row.quantity) {
  const n = Math.max(1, Math.min(count, row.quantity));
  const id = ownedId(card.scryfallId, foil);
  await db.transaction("rw", db.owned, async () => {
    if (id === row.id) { await db.owned.update(id, { card, foil }); return; }
    const target = await db.owned.get(id);
    if (target) await db.owned.update(id, { quantity: target.quantity + n, card, foil });
    else {
      await db.owned.put({
        ...row,
        id,
        quantity: n,
        card,
        foil,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        scryfallId: card.scryfallId,
        enrichError: undefined,
        importedAt: Date.now(),
      });
    }
    if (n >= row.quantity) await db.owned.delete(row.id);
    else await db.owned.update(row.id, { quantity: row.quantity - n });
  });
}
