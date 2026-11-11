import { deckFromText, scrapeDeck } from "@/lib/scrapers";

/** POST { url } or { text, name } → ReferenceDeck */
export async function POST(req: Request) {
  let body: { url?: string; text?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    if (body.text?.trim()) {
      const deck = deckFromText(body.text, body.name?.trim() || "Pasted deck");
      if (!deck.cards.length) return Response.json({ error: "No cards found in that text." }, { status: 400 });
      return Response.json({ deck });
    }
    if (!body.url?.trim()) return Response.json({ error: "Give me a URL or a pasted decklist." }, { status: 400 });
    const deck = await scrapeDeck(body.url.trim());
    if (!deck.cards.length) return Response.json({ error: "That deck came back empty." }, { status: 400 });
    return Response.json({ deck });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Scrape failed" }, { status: 502 });
  }
}
