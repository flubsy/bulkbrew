import { printingSuffix, type PrintingLookup } from "./printings";
import type { BuiltDeck, DeckEntry } from "./types";

/**
 * Plain text decklist, importable by Moxfield, Archidekt, MTGO and Arena. With `printing`, each
 * line carries the set, collector number and foil flag of the copy you own ("1 Sol Ring (C21) 263"),
 * so Moxfield and Archidekt show your actual art. Leave it out for Arena/MTGO.
 */
export function deckToText(deck: BuiltDeck, printing?: PrintingLookup): string {
  const line = (c: DeckEntry) => `${c.quantity} ${c.name}${printing ? printingSuffix(printing(c)) : ""}`;
  const lines: string[] = [];
  if (deck.commanders.length) {
    lines.push("Commander");
    for (const c of deck.commanders) lines.push(line(c));
    lines.push("");
    lines.push("Deck");
  }
  for (const c of deck.cards) lines.push(line(c));
  return lines.join("\n");
}

export function deckToCsv(deck: BuiltDeck, printing?: PrintingLookup): string {
  const rows = [["Quantity", "Name", "Set code", "Collector number", "Foil", "Role", "CMC", "Type", "Price USD", "Reason"]];
  for (const c of [...deck.commanders, ...deck.cards]) {
    const p = printing?.(c);
    rows.push([String(c.quantity), c.name, p?.set.toUpperCase() ?? "", p?.number ?? "", p?.foil ? "foil" : "", c.role, String(c.cmc), c.typeLine, c.priceUsd?.toFixed(2) ?? "", c.reason]);
  }
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
