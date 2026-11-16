import { edhrecSlug } from "./edhrec";
import { isBasic } from "./scryfall";
import { cached, DAY } from "./server-cache";

/**
 * Real Commander decklists for a commander, used by builder/similar.ts ("decks like yours").
 *
 * Sources, best-effort and cached for a week (decklists change slowly; this keeps us polite):
 *  1. EDHREC's recent decks for the commander: the deck list behind edhrec.com/decks/<slug>, then each
 *     deck's card list. Unofficial endpoints, like everything we read from EDHREC.
 *  2. Archidekt's public deck search for the commander, then each deck's JSON (the same deck endpoint
 *     the importer uses).
 * Any failure just means fewer samples; with under 8 the builder skips this step. At most 40 decks,
 * 6 fetches at a time, and the whole gather gives up after 20 seconds.
 *
 * NOTE: the EDHREC deck-list/deck-preview paths and the Archidekt search parameters couldn't be
 * checked from the build sandbox. If a source never returns decks in production, the URLs below are
 * the place to look; the build note says how many samples each source gave.
 */

const UA = "Deckbit/0.1 (collection deck builder)";
const MAX_DECKS = 40;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Run `fn` over items with at most `n` in flight, stopping early once `enough` returns true. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R | null>, enough: (got: R[]) => boolean): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length && !enough(out)) {
      const r = await fn(items[i++]);
      if (r) out.push(r);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

const clean = (names: string[], commanders: Set<string>) =>
  [...new Set(names.filter((n) => n && !isBasic(n) && !commanders.has(n.toLowerCase())))];

async function fromEdhrec(commander: string, partner: string | undefined, cmdSet: Set<string>): Promise<string[][]> {
  const slug = partner ? `${edhrecSlug(commander)}-${edhrecSlug(partner)}` : edhrecSlug(commander);
  type List = { table?: { urlhash?: string }[]; decks?: { urlhash?: string }[] };
  const list = await json<List>(`https://json.edhrec.com/pages/decks/${slug}.json`);
  const hashes = [...(list?.table ?? []), ...(list?.decks ?? [])].map((d) => d.urlhash).filter((h): h is string => !!h).slice(0, MAX_DECKS * 2);
  type Preview = { cards?: (string | { name?: string })[]; commanders?: string[] };
  return pool(hashes, 6, async (h) => {
    const d = await json<Preview>(`https://edhrec.com/api/deckpreview/${h}`);
    const names = (d?.cards ?? []).map((c) => (typeof c === "string" ? c : c.name ?? ""));
    const deck = clean(names, cmdSet);
    return deck.length >= 40 ? deck : null;
  }, (got) => got.length >= MAX_DECKS).then((d) => d.slice(0, MAX_DECKS));
}

async function fromArchidekt(commander: string, cmdSet: Set<string>, want: number): Promise<string[][]> {
  if (want <= 0) return [];
  type Search = { results?: { id?: number }[] };
  const q = new URLSearchParams({ commanderName: commander.split(" // ")[0], deckFormat: "3", orderBy: "-viewCount", pageSize: "50" });
  const search = await json<Search>(`https://archidekt.com/api/decks/v3/?${q}`);
  const ids = (search?.results ?? []).map((r) => r.id).filter((id): id is number => !!id);
  type ArchiDeck = { cards?: { quantity: number; categories?: string[]; card?: { oracleCard?: { name?: string } } }[] };
  return pool(ids, 6, async (id) => {
    const d = await json<ArchiDeck>(`https://archidekt.com/api/decks/${id}/`);
    const names = (d?.cards ?? [])
      .filter((c) => !(c.categories ?? []).some((x) => /maybeboard|sideboard|commander/i.test(x)))
      .map((c) => c.card?.oracleCard?.name ?? "");
    const deck = clean(names, cmdSet);
    return deck.length >= 40 ? deck : null;
  }, (got) => got.length >= want).then((d) => d.slice(0, want)); // a few fetches can finish past the cap
}

export async function sampleDecks(commander: string, partner?: string): Promise<{ decks: string[][]; sources: Record<string, number> }> {
  const key = `similar:${edhrecSlug(commander)}${partner ? `+${edhrecSlug(partner)}` : ""}`;
  const result = await cached<{ decks: string[][]; sources: Record<string, number> }>(key, 7 * DAY, async () => {
    const cmdSet = new Set([commander, partner].filter(Boolean).map((n) => n!.toLowerCase()));
    const gather = (async () => {
      const edh = await fromEdhrec(commander, partner, cmdSet);
      const archi = partner ? [] : await fromArchidekt(commander, cmdSet, MAX_DECKS - edh.length);
      return { decks: [...edh, ...archi].slice(0, MAX_DECKS), sources: { EDHREC: edh.length, Archidekt: archi.length } };
    })();
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
    const got = await Promise.race([gather, timeout]);
    return got && got.decks.length ? got : null;
  });
  return result ?? { decks: [], sources: {} };
}
