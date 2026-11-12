import { cached, HOUR } from "@/lib/server-cache";
import { CURRENCIES, FALLBACK_RATES, type Rates } from "@/lib/currency";

/**
 * GET → { rates: { USD: 1, AUD: …, … }, source, date }. USD-based exchange rates for price display.
 * ECB reference rates via Frankfurter (free, no key), falling back to open.er-api.com, then to
 * built-in rates. Cached for 12 hours on the server and at the CDN.
 */
const CODES = CURRENCIES.map((c) => c.code).filter((c) => c !== "USD");

async function frankfurter(): Promise<{ rates: Rates; date?: string } | null> {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CODES.join(",")}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = (await res.json()) as { rates?: Record<string, number>; date?: string };
  if (!j.rates) return null;
  return { rates: { ...FALLBACK_RATES, ...j.rates, USD: 1 } as Rates, date: j.date };
}

async function erApi(): Promise<{ rates: Rates; date?: string } | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
  if (!j.rates) return null;
  const rates = { ...FALLBACK_RATES };
  for (const c of CODES) if (typeof j.rates[c] === "number") rates[c] = j.rates[c];
  return { rates, date: j.time_last_update_utc };
}

export async function GET() {
  const live = await cached("fx:usd", 12 * HOUR, async () => {
    try {
      return (await frankfurter()) ?? (await erApi());
    } catch {
      try { return await erApi(); } catch { return null; }
    }
  });
  const body = live ? { ...live, source: "live" } : { rates: FALLBACK_RATES, source: "fallback" };
  return Response.json(body, { headers: { "Cache-Control": live ? "public, s-maxage=43200, stale-while-revalidate=86400" : "no-store" } });
}
