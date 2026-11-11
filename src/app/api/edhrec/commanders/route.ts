import { commanderStats, trendingCommanders } from "@/lib/edhrec";

/**
 * POST { commanders: { name, ci }[] } → { stats: Record<lowerName, { decks, colorRank, trend }>, trending: Record<lowerName, position> }
 * Popularity comes from EDHREC's per-colour commander lists (decks registered in the past ~2 years).
 */
export async function POST(req: Request) {
  let body: { commanders?: { name: string; ci: string[] }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const list = (body.commanders ?? []).slice(0, 1500);
  const [stats, trending] = await Promise.all([commanderStats(list), trendingCommanders()]);
  return Response.json({ stats, trending });
}
