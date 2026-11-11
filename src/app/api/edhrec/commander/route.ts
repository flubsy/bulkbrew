import { edhrecCommander } from "@/lib/edhrec";

/** GET ?name=…&partner=… → { decks, rank, salt, tags } (EDHREC tags players put on decks for this commander). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const info = await edhrecCommander(name, url.searchParams.get("partner") ?? undefined);
  if (!info) return Response.json({ decks: null, rank: null, salt: null, tags: [] });
  return Response.json({ decks: info.decks, rank: info.rank, salt: info.salt, tags: info.tags.slice(0, 24) });
}
