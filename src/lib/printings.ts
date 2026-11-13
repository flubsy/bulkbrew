import type { DeckEntry, OwnedCard } from "./types";

/** The printing of a card you own: what Moxfield/Archidekt need to show your actual art. */
export interface Printing {
  set: string;
  number: string;
  foil: boolean;
}

export type PrintingLookup = (e: Pick<DeckEntry, "name" | "scryfallId">) => Printing | undefined;

/**
 * Index the collection so each deck card maps to the copy you own: the exact printing the
 * builder used when it's still in the collection, otherwise the printing you have most of.
 */
export function printingIndex(owned: OwnedCard[]): PrintingLookup {
  const byId = new Map<string, Printing>();
  const byName = new Map<string, { p: Printing; qty: number }>();
  for (const o of owned) {
    const c = o.card;
    if (!c) continue;
    const p = { set: c.setCode, number: c.collectorNumber, foil: !!o.foil };
    if (!byId.has(c.scryfallId) || !o.foil) byId.set(c.scryfallId, p);
    const key = c.name.toLowerCase();
    const cur = byName.get(key);
    if (!cur || o.quantity > cur.qty) byName.set(key, { p, qty: o.quantity });
  }
  return (e) => (e.scryfallId && byId.get(e.scryfallId)) || byName.get(e.name.toLowerCase())?.p;
}

/** "(C21) 263 *F*": the suffix Moxfield and Archidekt both read on import. */
export function printingSuffix(p?: Printing): string {
  if (!p?.set) return "";
  return ` (${p.set.toUpperCase()})${p.number ? ` ${p.number}` : ""}${p.foil ? " *F*" : ""}`;
}
