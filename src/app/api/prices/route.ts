import { cheapestPrices } from "@/lib/scryfall";

export const maxDuration = 60;

/**
 * POST { oracleIds: string[] } → { prices: Record<oracleId, usd> }
 * Cheapest priced printing for each card. Used to repair collections imported before prices were
 * backfilled (rows whose printing has no Scryfall price). Max 300 ids per call.
 */
export async function POST(req: Request) {
  let body: { oracleIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = [...new Set(body.oracleIds ?? [])].slice(0, 300);
  const prices = await cheapestPrices(ids, 20);
  return Response.json({ prices: Object.fromEntries(prices) });
}
