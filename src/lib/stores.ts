import type { CurrencyCode } from "./currency";

/**
 * Where to buy a card, by region. All links are plain searches on the store's site (no affiliate
 * codes). The mtgsingles URLs follow its search box; if the site changes, fix them here.
 */
export interface Store {
  id: string;
  label: string;
  region: string;
  url: (name: string) => string;
}

const q = (s: string) => encodeURIComponent(s);

export const STORES: Store[] = [
  { id: "tcgplayer", label: "TCGplayer", region: "US", url: (n) => `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${q(n)}&view=grid` },
  { id: "cardkingdom", label: "Card Kingdom", region: "US / EU", url: (n) => `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${q(n)}` },
  { id: "cardmarket", label: "Cardmarket", region: "EU / UK", url: (n) => `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q(n)}` },
  { id: "mtgsingles-nz", label: "MTG Singles NZ", region: "NZ", url: (n) => `https://www.mtgsingles.co.nz/search?q=${q(n)}` },
  { id: "mtgsingles-au", label: "MTG Singles AU", region: "AU", url: (n) => `https://www.mtgsingles.co.nz/au/search?q=${q(n)}` },
];

/** Stores for the viewer's currency first (the first is the "main" one), the rest after. */
const ORDER: Record<CurrencyCode, string[]> = {
  USD: ["tcgplayer", "cardkingdom"],
  CAD: ["tcgplayer", "cardkingdom"],
  EUR: ["cardkingdom", "cardmarket"],
  GBP: ["cardmarket", "cardkingdom"],
  NZD: ["mtgsingles-nz"],
  AUD: ["mtgsingles-au"],
};

export function storesFor(code: CurrencyCode): { primary: Store[]; other: Store[] } {
  const ids = ORDER[code] ?? ORDER.USD;
  return {
    primary: ids.map((id) => STORES.find((s) => s.id === id)!),
    other: STORES.filter((s) => !ids.includes(s.id)),
  };
}

/** TCGplayer's mass entry: the whole list in one cart search. */
export function tcgplayerMassEntry(names: string[]): string {
  return `https://www.tcgplayer.com/massentry?productline=Magic&c=${q(names.map((n) => `1 ${n}`).join("||"))}`;
}
