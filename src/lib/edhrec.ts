import { cached, DAY } from "./server-cache";
import { comboKey, type DeckProfile, type EdhrecCard, type EdhrecTag } from "./types";

/**
 * EDHREC has no official API; its site is backed by static JSON at json.edhrec.com.
 * Everything here is best-effort and cached on disk for a day. Any failure returns
 * empty data and the builder carries on with its other signals.
 */

const UA = "BulkBrew/0.1 (collection deck builder)";

export function edhrecSlug(name: string): string {
  return name
    .split("//")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** EDHREC's colour-identity page slugs. */
export const COLOR_SLUG: Record<string, string> = {
  "": "colorless", W: "mono-white", U: "mono-blue", B: "mono-black", R: "mono-red", G: "mono-green",
  WU: "azorius", UB: "dimir", BR: "rakdos", RG: "gruul", WG: "selesnya", WB: "orzhov", UR: "izzet", BG: "golgari", WR: "boros", UG: "simic",
  WUB: "esper", UBR: "grixis", BRG: "jund", WRG: "naya", WUG: "bant", WBG: "abzan", WUR: "jeskai", UBG: "sultai", WBR: "mardu", URG: "temur",
  WUBR: "yore-tiller", UBRG: "glint-eye", WBRG: "dune-brood", WURG: "ink-treader", WUBG: "witch-maw", WUBRG: "five-color",
};

async function getPage<T>(p: string): Promise<T | null> {
  return cached<T>(`edhrec:${p}`, DAY, async () => {
    try {
      const res = await fetch(`https://json.edhrec.com/pages/${p}.json`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  });
}

type JsonCard = { name: string; synergy?: number; inclusion?: number; num_decks?: number; potential_decks?: number; trend_zscore?: number; rank?: number };
type JsonList = { header: string; tag?: string; cardviews: JsonCard[]; more?: string };
type CommanderJson = {
  container?: { json_dict?: { cardlists?: JsonList[]; card?: { num_decks?: number; rank?: number; salt?: number; name?: string } } };
  panels?: {
    taglinks?: { value: string; slug: string; count: number }[];
    piechart?: { content?: { label: string; value: number }[] };
    mana_curve?: Record<string, number>;
  };
} & Partial<Record<"creature" | "instant" | "sorcery" | "artifact" | "enchantment" | "planeswalker" | "battle" | "land" | "basic" | "nonbasic", number>>;

/** Lists that say "this commander's players really run this" go first, so a card in several lists keeps the strongest label. */
const LIST_ORDER: Record<string, number> = { highsynergycards: 0, topcards: 1, gamechangers: 2, highliftcards: 3, newcards: 9 };

function flatten(page: CommanderJson | null): EdhrecCard[] {
  const out: EdhrecCard[] = [];
  const seen = new Set<string>();
  const lists = [...(page?.container?.json_dict?.cardlists ?? [])].sort((a, b) => (LIST_ORDER[a.tag ?? ""] ?? 5) - (LIST_ORDER[b.tag ?? ""] ?? 5));
  for (const list of lists) {
    for (const c of list.cardviews ?? []) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const inclusion = c.num_decks && c.potential_decks ? c.num_decks / c.potential_decks : c.inclusion;
      out.push({ name: c.name, synergy: c.synergy, inclusion, decks: c.num_decks, label: list.header.toLowerCase() });
    }
  }
  return out;
}


function profileOf(page: CommanderJson | null): DeckProfile | undefined {
  if (!page) return undefined;
  const types: Record<string, number> = {};
  for (const s of page.panels?.piechart?.content ?? []) types[s.label.toLowerCase()] = s.value;
  for (const k of ["creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker", "battle", "land"] as const) {
    if (typeof page[k] === "number") types[k] = page[k]!;
  }
  const curve: Record<number, number> = {};
  for (const [k, v] of Object.entries(page.panels?.mana_curve ?? {})) if (Number.isFinite(+k) && v > 0) curve[+k] = v;
  const lands = types.land;
  if (!lands || !Object.keys(curve).length) return undefined;
  return { lands, types, curve };
}

export interface CommanderInfo {
  name: string;
  slug: string;
  decks: number | null;
  rank: number | null;
  salt: number | null;
  tags: EdhrecTag[];
  cards: EdhrecCard[];
  /** The EDHREC "average deck" — what a typical list for this commander (+ tag) runs. */
  averageDeck: string[];
  profile?: DeckProfile;
  tagUsed?: string;
}

function commanderBase(commander: string, partner?: string) {
  return partner ? `${edhrecSlug(commander)}-${edhrecSlug(partner)}` : edhrecSlug(commander);
}

async function averageDeck(base: string, tag?: string): Promise<string[]> {
  type Avg = { deck?: { cards?: Record<string, [string, number][]> } };
  const page = (tag ? await getPage<Avg>(`average-decks/${base}/${tag}`) : null) ?? (await getPage<Avg>(`average-decks/${base}`));
  const groups = page?.deck?.cards ?? {};
  return Object.values(groups).flatMap((g) => g.map(([n]) => n));
}

/** Everything EDHREC knows about a commander, optionally narrowed to one of its tags (e.g. "dragons"). */
export async function edhrecCommander(commander: string, partner?: string, tag?: string): Promise<CommanderInfo | null> {
  const base = commanderBase(commander, partner);
  const plain = await getPage<CommanderJson>(`commanders/${base}`);
  if (!plain) return null;
  const themed = tag ? await getPage<CommanderJson>(`commanders/${base}/${tag}`) : null;
  const card = plain.container?.json_dict?.card;
  const themedCards = flatten(themed);
  return {
    name: card?.name ?? commander,
    slug: base,
    decks: card?.num_decks ?? null,
    rank: card?.rank ?? null,
    salt: card?.salt ?? null,
    tags: (plain.panels?.taglinks ?? []).map((t) => ({ slug: t.slug, label: t.value, decks: t.count })),
    cards: themedCards.length ? themedCards : flatten(plain),
    averageDeck: await averageDeck(base, themedCards.length ? tag : undefined),
    profile: (themedCards.length ? profileOf(themed) : undefined) ?? profileOf(plain),
    tagUsed: themedCards.length ? tag : undefined,
  };
}

/**
 * Tag page across ALL commanders (e.g. every Grixis "spellslinger" deck), optionally narrowed to a
 * colour identity. This is the "how good is this card in this kind of deck" signal, independent of
 * the commander — it catches strong cards a single commander's page under-rates.
 */
export async function edhrecForTag(tag: string, ci?: readonly string[]): Promise<EdhrecCard[]> {
  if (ci) {
    const slug = COLOR_SLUG[comboKey(ci)];
    if (slug) {
      const scoped = flatten(await getPage<CommanderJson>(`tags/${tag}/${slug}`));
      if (scoped.length) return scoped;
    }
  }
  return flatten(await getPage<CommanderJson>(`tags/${tag}`));
}

/** Theme page without a commander (e.g. "tokens") — top cards across all decks of that theme. */
export async function edhrecForTheme(theme: string, ci?: readonly string[]): Promise<EdhrecCard[]> {
  return edhrecForTag(theme, ci);
}

/* ----------------------------- Commander popularity ----------------------------- */

export interface CommanderStat {
  decks: number;
  colorRank: number; // 1 = most played commander in its colour identity
  trend: number | null; // EDHREC trend z-score (positive = rising)
}

type ListPage = { container?: { json_dict?: { cardlists?: JsonList[] } }; cardviews?: JsonCard[]; more?: string };

/** Walk a colour identity's commander list (100 per page) until every wanted name is found. */
async function colorStats(key: string, wanted: Set<string>, maxPages = 8): Promise<Map<string, CommanderStat>> {
  const out = new Map<string, CommanderStat>();
  const slug = COLOR_SLUG[key];
  if (!slug) return out;
  let page = await getPage<ListPage>(`commanders/${slug}`);
  let list: JsonCard[] = page?.container?.json_dict?.cardlists?.[0]?.cardviews ?? [];
  let more = page?.container?.json_dict?.cardlists?.[0]?.more;
  let rank = 0;
  for (let i = 0; i < maxPages; i++) {
    for (const c of list) {
      rank++;
      const n = c.name.toLowerCase();
      if (wanted.has(n)) out.set(n, { decks: c.num_decks ?? 0, colorRank: rank, trend: c.trend_zscore ?? null });
    }
    if (out.size >= wanted.size || !more) break;
    page = await getPage<ListPage>(more.replace(/\.json$/, ""));
    list = page?.cardviews ?? [];
    more = page?.more;
  }
  return out;
}

/** Popularity for a batch of commanders, grouped by colour identity. Unknown = not in EDHREC's top lists. */
export async function commanderStats(cmdrs: { name: string; ci: string[] }[]): Promise<Record<string, CommanderStat>> {
  const byColor = new Map<string, Set<string>>();
  for (const c of cmdrs) {
    const k = comboKey(c.ci);
    if (!byColor.has(k)) byColor.set(k, new Set());
    byColor.get(k)!.add(c.name.toLowerCase());
  }
  const result: Record<string, CommanderStat> = {};
  await Promise.all(
    [...byColor.entries()].map(async ([k, names]) => {
      const m = await colorStats(k, names);
      for (const [n, s] of m) result[n] = s;
    }),
  );
  return result;
}

/** EDHREC's "trending this week" commander list (top 100), lower-cased names → position. */
export async function trendingCommanders(): Promise<Record<string, number>> {
  const page = await getPage<ListPage>("commanders/week");
  const list = page?.container?.json_dict?.cardlists?.[0]?.cardviews ?? [];
  return Object.fromEntries(list.map((c, i) => [c.name.toLowerCase(), i + 1]));
}
