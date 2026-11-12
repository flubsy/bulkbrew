import { fetchPrints } from "@/lib/scryfall";

/** GET ?oracleId=… → { prints: CardData[] }: every paper printing of one card, newest first. */
export async function GET(req: Request) {
  const oracleId = new URL(req.url).searchParams.get("oracleId") ?? "";
  try {
    const prints = await fetchPrints(oracleId);
    return Response.json({ prints }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Scryfall request failed" }, { status: 502 });
  }
}
