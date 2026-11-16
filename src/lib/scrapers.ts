import * as cheerio from "cheerio";
import { parseDecklistText } from "./csv";
import type { ReferenceDeck } from "./types";

/**
 * Deck scrapers. Server-side only (CORS). Each returns a ReferenceDeck.
 *
 *  - Moxfield:    public JSON API (api2.moxfield.com). Moxfield fronts it with bot protection; if you
 *                 have an approved User-Agent from them, set MOXFIELD_USER_AGENT in .env.local.
 *  - Archidekt:   public JSON API (archidekt.com/api/decks/{id}/).
 *  - MTGGoldfish: /deck/download/{id} returns a plain-text decklist. Archetype pages are resolved
 *                 to their download link.
 *  - Text:        a pasted decklist.
 */

const UA = process.env.MOXFIELD_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Deckbit/0.1";

type Card = ReferenceDeck["cards"][number];

export type Source = ReferenceDeck["source"];

export function detectSource(url: string): Source | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h.endsWith("moxfield.com")) return "moxfield";
    if (h.endsWith("archidekt.com")) return "archidekt";
    if (h.endsWith("mtggoldfish.com")) return "mtggoldfish";
    if (h.endsWith("deckstats.net")) return "deckstats";
    if (h.endsWith("tappedout.net")) return "tappedout";
    return null;
  } catch {
    return null;
  }
}

export async function scrapeDeck(url: string): Promise<ReferenceDeck> {
  const source = detectSource(url);
  switch (source) {
    case "moxfield":
      return scrapeMoxfield(url);
    case "archidekt":
      return scrapeArchidekt(url);
    case "mtggoldfish":
      return scrapeGoldfish(url);
    case "deckstats":
      return scrapeDeckstats(url);
    case "tappedout":
      return scrapeTappedOut(url);
    default:
      throw new Error("Unsupported URL. Supported: Moxfield, Archidekt, MTGGoldfish, Deckstats, TappedOut — or paste the decklist text.");
  }
}

export function deckFromText(text: string, name = "Pasted deck"): ReferenceDeck {
  const cards: Card[] = [];
  let board: Card["board"] = "main";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(commander|commanders)\s*:?$/i.test(line)) { board = "commander"; continue; }
    if (/^(sideboard|side)\s*:?$/i.test(line)) { board = "side"; continue; }
    if (/^(maybeboard|maybe|considering)\s*:?$/i.test(line)) { board = "maybe"; continue; }
    if (/^(deck|main|mainboard)\s*:?$/i.test(line)) { board = "main"; continue; }
    if (!line) continue;
    for (const r of parseDecklistText(line)) cards.push({ name: r.name, quantity: r.quantity, board });
  }
  const commanders = cards.filter((c) => c.board === "commander").map((c) => c.name);
  return {
    id: `text:${hash(text)}`,
    source: "text",
    url: "",
    name,
    commanders,
    cards,
    fetchedAt: Date.now(),
  };
}

/* ----------------------------- Moxfield ----------------------------- */

type MoxCard = { quantity: number; card: { name: string } };
type MoxBoard = { count: number; cards: Record<string, MoxCard> };
type MoxDeck = {
  name: string;
  format?: string;
  boards?: Record<string, MoxBoard>;
  mainboard?: Record<string, MoxCard>;
  commanders?: Record<string, MoxCard>;
  sideboard?: Record<string, MoxCard>;
};

async function scrapeMoxfield(url: string): Promise<ReferenceDeck> {
  const id = /\/decks\/([A-Za-z0-9_-]+)/.exec(url)?.[1];
  if (!id) throw new Error("Could not find a deck id in that Moxfield URL.");
  const endpoints = [`https://api2.moxfield.com/v3/decks/all/${id}`, `https://api.moxfield.com/v2/decks/all/${id}`];
  let data: MoxDeck | null = null;
  let lastErr = "";
  for (const ep of endpoints) {
    const res = await fetch(ep, { headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.moxfield.com/" } });
    if (res.ok) { data = (await res.json()) as MoxDeck; break; }
    lastErr = `${res.status}`;
  }
  if (!data) {
    throw new Error(
      `Moxfield refused the request (${lastErr}). Moxfield blocks most automated traffic. ` +
        `Open the deck, use Export → copy the text, and paste it here instead. ` +
        `If Moxfield has given you an API User-Agent, set MOXFIELD_USER_AGENT in .env.local.`,
    );
  }
  const cards: Card[] = [];
  const push = (board: Card["board"], m?: Record<string, MoxCard>) => {
    if (!m) return;
    for (const v of Object.values(m)) cards.push({ name: v.card.name, quantity: v.quantity, board });
  };
  if (data.boards) {
    push("main", data.boards.mainboard?.cards);
    push("commander", data.boards.commanders?.cards);
    push("side", data.boards.sideboard?.cards);
    push("maybe", data.boards.maybeboard?.cards);
  } else {
    push("main", data.mainboard);
    push("commander", data.commanders);
    push("side", data.sideboard);
  }
  return {
    id: `moxfield:${id}`,
    source: "moxfield",
    url,
    name: data.name,
    format: data.format,
    commanders: cards.filter((c) => c.board === "commander").map((c) => c.name),
    cards,
    fetchedAt: Date.now(),
  };
}

/* ----------------------------- Archidekt ----------------------------- */

type ArchiCard = {
  quantity: number;
  categories?: string[];
  card: { oracleCard: { name: string } };
};
type ArchiDeck = { name: string; deckFormat?: number; cards: ArchiCard[]; categories?: { name: string; includedInDeck: boolean }[] };

const ARCHI_FORMATS: Record<number, string> = { 1: "standard", 2: "modern", 3: "commander", 4: "legacy", 5: "vintage", 6: "pauper", 7: "custom", 8: "frontier", 9: "future", 10: "penny", 11: "1v1", 12: "duel", 13: "brawl", 14: "oathbreaker", 15: "pioneer", 16: "historic", 17: "pauper commander", 18: "alchemy", 19: "explorer", 20: "historic brawl", 21: "gladiator", 22: "premodern", 23: "predh", 24: "timeless" };

async function scrapeArchidekt(url: string): Promise<ReferenceDeck> {
  const id = /\/decks\/(\d+)/.exec(url)?.[1];
  if (!id) throw new Error("Could not find a deck id in that Archidekt URL.");
  const res = await fetch(`https://archidekt.com/api/decks/${id}/`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Archidekt returned ${res.status}. Is the deck public?`);
  const data = (await res.json()) as ArchiDeck;
  const excluded = new Set((data.categories ?? []).filter((c) => !c.includedInDeck).map((c) => c.name.toLowerCase()));
  const cards: Card[] = data.cards.map((c) => {
    const cats = (c.categories ?? []).map((x) => x.toLowerCase());
    let board: Card["board"] = "main";
    if (cats.includes("commander")) board = "commander";
    else if (cats.includes("sideboard")) board = "side";
    else if (cats.some((x) => excluded.has(x) || x === "maybeboard")) board = "maybe";
    return { name: c.card.oracleCard.name, quantity: c.quantity, board };
  });
  return {
    id: `archidekt:${id}`,
    source: "archidekt",
    url,
    name: data.name,
    format: data.deckFormat ? ARCHI_FORMATS[data.deckFormat] : undefined,
    commanders: cards.filter((c) => c.board === "commander").map((c) => c.name),
    cards,
    fetchedAt: Date.now(),
  };
}

/* ----------------------------- MTGGoldfish ----------------------------- */

async function scrapeGoldfish(url: string): Promise<ReferenceDeck> {
  let id = /\/deck\/(?:download\/)?(\d+)/.exec(url)?.[1];
  let name = `MTGGoldfish deck`;
  let format: string | undefined;
  if (!id) {
    // Archetype or other page: find the download link and title in the HTML.
    const html = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
    const $ = cheerio.load(html);
    const dl = $('a[href*="/deck/download/"]').first().attr("href");
    id = dl ? /\/deck\/download\/(\d+)/.exec(dl)?.[1] : undefined;
    name = $("h1.title").first().text().replace(/\s+/g, " ").trim() || name;
    format = $(".deck-container-information").text().match(/Format:\s*(\w+)/i)?.[1]?.toLowerCase();
  } else {
    const html = await (await fetch(`https://www.mtggoldfish.com/deck/${id}`, { headers: { "User-Agent": UA } })).text();
    const $ = cheerio.load(html);
    name = $("h1.title").first().text().replace(/\s+/g, " ").trim() || name;
    format = $(".deck-container-information").text().match(/Format:\s*(\w+)/i)?.[1]?.toLowerCase();
  }
  if (!id) throw new Error("Could not find a downloadable decklist on that MTGGoldfish page.");
  const text = await (await fetch(`https://www.mtggoldfish.com/deck/download/${id}`, { headers: { "User-Agent": UA } })).text();
  if (text.trim().startsWith("<")) throw new Error("MTGGoldfish blocked the download (bot protection). Paste the decklist text instead.");
  const deck = deckFromText(text, name.replace(/\s+by\s+.*$/i, ""));
  // Goldfish commander decks list the commander first in a "Commander" section; also handle "1 Name" at top for EDH.
  return { ...deck, id: `mtggoldfish:${id}`, source: "mtggoldfish", url, format };
}

/* ----------------------------- Deckstats / TappedOut (text exports) ----------------------------- */

async function scrapeDeckstats(url: string): Promise<ReferenceDeck> {
  const u = new URL(url);
  u.searchParams.set("export_mtgarena", "1");
  const text = await (await fetch(u.toString(), { headers: { "User-Agent": UA } })).text();
  if (text.trim().startsWith("<")) throw new Error("Deckstats did not return a text export. Paste the decklist instead.");
  const deck = deckFromText(text, "Deckstats deck");
  return { ...deck, id: `deckstats:${hash(url)}`, source: "deckstats", url };
}

async function scrapeTappedOut(url: string): Promise<ReferenceDeck> {
  const slug = /\/mtg-decks\/([^/?#]+)/.exec(url)?.[1];
  if (!slug) throw new Error("Could not find a deck slug in that TappedOut URL.");
  const text = await (await fetch(`https://tappedout.net/mtg-decks/${slug}/?fmt=txt`, { headers: { "User-Agent": UA } })).text();
  if (text.trim().startsWith("<")) throw new Error("TappedOut did not return a text export. Paste the decklist instead.");
  const deck = deckFromText(text, slug.replace(/-/g, " "));
  return { ...deck, id: `tappedout:${slug}`, source: "tappedout", url };
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
