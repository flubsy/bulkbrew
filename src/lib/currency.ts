/**
 * Display currency. Every price in BulkBrew is stored in USD (Scryfall's TCGplayer price) and
 * converted for display only, using daily ECB rates from /api/fx. Budgets typed in the chosen
 * currency are converted back to USD before they reach the engine.
 */

export const CURRENCIES = [
  { code: "USD", label: "US dollar", symbol: "US$", locale: "en-US" },
  { code: "AUD", label: "Australian dollar", symbol: "A$", locale: "en-AU" },
  { code: "NZD", label: "New Zealand dollar", symbol: "NZ$", locale: "en-NZ" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE" },
  { code: "GBP", label: "British pound", symbol: "£", locale: "en-GB" },
  { code: "CAD", label: "Canadian dollar", symbol: "C$", locale: "en-CA" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export type Rates = Record<CurrencyCode, number>;

/** Used until (or if) the live rates load. Rough mid-2026 values. */
export const FALLBACK_RATES: Rates = { USD: 1, AUD: 1.52, NZD: 1.68, EUR: 0.87, GBP: 0.75, CAD: 1.38 };

export function isCurrency(x: unknown): x is CurrencyCode {
  return CURRENCIES.some((c) => c.code === x);
}

/** Best guess from the browser's language, e.g. en-AU → AUD. */
export function guessCurrency(langs: readonly string[]): CurrencyCode {
  for (const l of langs) {
    const region = l.split("-")[1]?.toUpperCase();
    if (region === "AU") return "AUD";
    if (region === "NZ") return "NZD";
    if (region === "GB" || region === "UK") return "GBP";
    if (region === "CA") return "CAD";
    if (region === "US") return "USD";
    if (region && ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "SK", "SI", "LU", "LV", "LT", "EE", "MT", "CY", "HR"].includes(region)) return "EUR";
  }
  return "USD";
}

export function symbolOf(code: CurrencyCode) {
  return CURRENCIES.find((c) => c.code === code)!.symbol;
}

/**
 * Compact price: two decimals under 1, one under 10, whole numbers above.
 * `whole` forces whole numbers (deck totals, collection value).
 */
export function formatMoney(usd: number | null | undefined, code: CurrencyCode, rates: Rates, opts: { whole?: boolean } = {}): string {
  if (usd == null || !Number.isFinite(usd)) return "";
  const v = usd * (rates[code] ?? 1);
  const sym = symbolOf(code);
  if (opts.whole || v >= 10) return `${sym}${Math.round(v).toLocaleString("en-US")}`;
  if (v < 1) return `${sym}${v.toFixed(2)}`;
  return `${sym}${v.toFixed(1)}`;
}
