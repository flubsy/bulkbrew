import { edhrecAverageList } from "@/lib/edhrec";
import type { ReferenceDeck } from "@/lib/types";

/** POST { commander, partner?, bracket? } → { deck: ReferenceDeck, bracketUsed? }: EDHREC's average list. */
export async function POST(req: Request) {
  let body: { commander?: string; partner?: string; bracket?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.commander?.trim()) return Response.json({ error: "Which commander?" }, { status: 400 });
  const avg = await edhrecAverageList(body.commander.trim(), body.partner?.trim() || undefined, body.bracket);
  if (!avg?.cards.length) return Response.json({ error: `EDHREC has no average deck for ${body.commander}. Check the spelling, or it may be too new or too niche.` }, { status: 404 });
  const commanders = avg.cards.filter((c) => c.commander).map((c) => c.name);
  const deck: ReferenceDeck = {
    id: `edhrec-avg:${body.commander}:${avg.bracketUsed ?? "all"}`,
    source: "text",
    url: "",
    name: avg.title ?? `EDHREC average: ${body.commander}`,
    commanders: commanders.length ? commanders : [body.commander.trim()],
    cards: avg.cards.map((c) => ({ name: c.name, quantity: c.quantity, board: c.commander ? "commander" : "main" })),
    fetchedAt: Date.now(),
  };
  return Response.json({ deck, bracketUsed: avg.bracketUsed });
}
