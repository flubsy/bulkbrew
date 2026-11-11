import type { BuiltDeck } from "./types";

/** Plain text decklist — importable by Moxfield, Archidekt, MTGO, Arena. */
export function deckToText(deck: BuiltDeck): string {
  const lines: string[] = [];
  if (deck.commanders.length) {
    lines.push("Commander");
    for (const c of deck.commanders) lines.push(`${c.quantity} ${c.name}`);
    lines.push("");
    lines.push("Deck");
  }
  for (const c of deck.cards) lines.push(`${c.quantity} ${c.name}`);
  return lines.join("\n");
}

export function deckToCsv(deck: BuiltDeck): string {
  const rows = [["Quantity", "Name", "Role", "CMC", "Type", "Price USD", "Reason"]];
  for (const c of [...deck.commanders, ...deck.cards]) rows.push([String(c.quantity), c.name, c.role, String(c.cmc), c.typeLine, c.priceUsd?.toFixed(2) ?? "", c.reason]);
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
