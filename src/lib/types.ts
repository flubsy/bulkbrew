/** Core data types shared by the client, the builder engine and the API routes. */

export type Color = "W" | "U" | "B" | "R" | "G";

export type Format =
  | "commander"
  | "standard"
  | "pioneer"
  | "modern"
  | "legacy"
  | "vintage"
  | "pauper"
  | "brawl"
  | "oathbreaker"
  | "casual";

export const FORMATS: { id: Format; label: string; size: number; singleton: boolean; scryfall: string }[] = [
  { id: "commander", label: "Commander (EDH)", size: 100, singleton: true, scryfall: "commander" },
  { id: "brawl", label: "Brawl", size: 100, singleton: true, scryfall: "brawl" },
  { id: "oathbreaker", label: "Oathbreaker", size: 60, singleton: true, scryfall: "oathbreaker" },
  { id: "standard", label: "Standard", size: 60, singleton: false, scryfall: "standard" },
  { id: "pioneer", label: "Pioneer", size: 60, singleton: false, scryfall: "pioneer" },
  { id: "modern", label: "Modern", size: 60, singleton: false, scryfall: "modern" },
  { id: "legacy", label: "Legacy", size: 60, singleton: false, scryfall: "legacy" },
  { id: "vintage", label: "Vintage", size: 60, singleton: false, scryfall: "vintage" },
  { id: "pauper", label: "Pauper", size: 60, singleton: false, scryfall: "pauper" },
  { id: "casual", label: "Casual 60 (no legality check)", size: 60, singleton: false, scryfall: "" },
];

/** One row from the user's collection import, before Scryfall enrichment. */
export interface CollectionRow {
  name: string;
  quantity: number;
  setCode?: string;
  collectorNumber?: string;
  scryfallId?: string;
  foil?: boolean;
  condition?: string;
  language?: string;
  purchasePrice?: number;
  tags?: string[];
}

/** A normalised Scryfall card. Kept small enough to ship thousands to the API. */
export interface CardData {
  scryfallId: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: Color[];
  colorIdentity: Color[];
  keywords: string[];
  producedMana: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout: string;
  legalities: Record<string, string>;
  priceUsd: number | null;
  priceUsdFoil: number | null;
  edhrecRank: number | null;
  gameChanger: boolean;
  imageSmall?: string;
  imageNormal?: string;
  releasedAt?: string;
}

/** A card the user owns: the row + the enrichment. Keyed by scryfallId when known. */
export interface OwnedCard extends CollectionRow {
  id: string; // stable key: scryfallId or `${name}|${setCode}|${collectorNumber}`
  card?: CardData;
  enrichError?: string;
  importedAt: number;
}

/** A decklist scraped from a deck site, used as reference for the builder. */
export interface ReferenceDeck {
  id: string; // `${source}:${externalId}`
  source: "moxfield" | "archidekt" | "mtggoldfish" | "text" | "deckstats" | "tappedout";
  url: string;
  name: string;
  format?: string;
  commanders: string[];
  cards: { name: string; quantity: number; board: "main" | "side" | "commander" | "maybe" }[];
  fetchedAt: number;
}

export type Bracket = 1 | 2 | 3 | 4 | 5;

export const BRACKETS: { id: Bracket; label: string; blurb: string }[] = [
  { id: 1, label: "1 · Exhibition", blurb: "Theme first. No game changers, no fast mana, no mass land denial, no infinite combos." },
  { id: 2, label: "2 · Core", blurb: "Precon-level. No game changers, no extra-turn chaining, no 2-card infinites." },
  { id: 3, label: "3 · Upgraded", blurb: "Up to 3 game changers, few tutors, no early combos." },
  { id: 4, label: "4 · Optimized", blurb: "Anything goes short of cEDH tuning." },
  { id: 5, label: "5 · cEDH", blurb: "Maximum power. Fast mana, tutors, combos." },
];

export const THEMES = [
  { id: "tribal", label: "Tribal / typal", hint: "Pick a creature type below" },
  { id: "artifacts", label: "Artifacts" },
  { id: "enchantments", label: "Enchantments" },
  { id: "counters", label: "+1/+1 counters" },
  { id: "tokens", label: "Tokens / go-wide" },
  { id: "spellslinger", label: "Spellslinger" },
  { id: "graveyard", label: "Graveyard / reanimator" },
  { id: "aristocrats", label: "Aristocrats / sacrifice" },
  { id: "lifegain", label: "Lifegain" },
  { id: "voltron", label: "Voltron / equipment & auras" },
  { id: "blink", label: "Blink / flicker" },
  { id: "landfall", label: "Lands matter" },
  { id: "control", label: "Control" },
  { id: "aggro", label: "Aggro" },
  { id: "combo", label: "Combo" },
  { id: "mill", label: "Mill" },
  { id: "stax", label: "Stax / tax" },
  { id: "ramp", label: "Big mana / ramp" },
  { id: "wheels", label: "Wheels / discard" },
  { id: "burn", label: "Burn / damage" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export interface BuildOptions {
  format: Format;
  commander?: string;
  partner?: string;
  bracket?: Bracket;
  budget?: number; // max total USD for the deck (excluding basics)
  maxCardPrice?: number; // per-card cap
  themes: ThemeId[];
  tribe?: string;
  /** An EDHREC tag slug for the commander (e.g. "dragons", "treasure"). Narrows EDHREC data to decks with that tag. */
  edhrecTag?: string;
  colors?: Color[]; // for non-commander formats; empty = any
  allowedSets?: string[]; // set codes; empty = any
  includeCards: string[];
  excludeCards: string[];
  referenceDeckIds: string[];
  useAI: boolean;
  useEdhrec: boolean; // pull EDHREC recommendations for the commander/theme as a scoring signal
  assumeBasics: boolean; // treat basic lands as unlimited
  preferCheap: boolean; // prefer cheaper cards when scores tie
  mustOwnEverything: boolean; // never suggest cards outside the collection (always true today)
}

export type Role =
  | "commander"
  | "land"
  | "ramp"
  | "draw"
  | "removal"
  | "wipe"
  | "counter"
  | "tutor"
  | "protection"
  | "recursion"
  | "finisher"
  | "synergy"
  | "creature"
  | "utility";

export interface DeckEntry {
  name: string;
  quantity: number;
  role: Role;
  cmc: number;
  typeLine: string;
  manaCost: string;
  priceUsd: number | null;
  score: number;
  reason: string;
  scryfallId?: string;
  imageSmall?: string;
  imageNormal?: string;
  gameChanger?: boolean;
  edhrec?: { synergy?: number; inclusion?: number; label?: string; decks?: number };
  inAverageDeck?: boolean;
}

/** A card EDHREC recommends for the commander/theme. */
export interface EdhrecCard {
  name: string;
  synergy?: number; // -1..1
  inclusion?: number; // 0..1 (fraction of decks)
  decks?: number; // number of decks running it
  label?: string; // "high synergy cards", "top cards", "creatures", …
}

/** What EDHREC's average deck for a commander (+ tag) looks like: land count, type split and non-land mana curve. */
export interface DeckProfile {
  lands: number;
  types: Record<string, number>; // "creature" → 29, …
  curve: Record<number, number>; // mana value → non-land cards
}

/** A tag EDHREC users put on decks for a commander, e.g. { slug: "dragons", label: "Dragons", decks: 527 }. */
export interface EdhrecTag {
  slug: string;
  label: string;
  decks: number;
}

/** A combo from Commander Spellbook. */
export interface Combo {
  id: string;
  cards: string[];
  produces: string[];
  bracketTag?: string;
  url: string;
  popularity?: number;
  /** Pieces not in the list that was checked (for "almost" combos). */
  missing: string[];
}

/** Colour combination names (guilds, shards, wedges, 4c, 5c). Keyed by sorted WUBRG letters. */
export const COLOR_COMBOS: Record<string, string> = {
  "": "Colorless",
  W: "Mono-white", U: "Mono-blue", B: "Mono-black", R: "Mono-red", G: "Mono-green",
  WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", WG: "Selesnya",
  WB: "Orzhov", UR: "Izzet", BG: "Golgari", WR: "Boros", UG: "Simic",
  WUB: "Esper", UBR: "Grixis", BRG: "Jund", WRG: "Naya", WUG: "Bant",
  WBG: "Abzan", WUR: "Jeskai", UBG: "Sultai", WBR: "Mardu", URG: "Temur",
  WUBR: "Yore-Tiller (non-green)", UBRG: "Glint-Eye (non-white)", WBRG: "Dune-Brood (non-blue)", WURG: "Ink-Treader (non-black)", WUBG: "Witch-Maw (non-red)",
  WUBRG: "Five-colour",
};

const WUBRG = ["W", "U", "B", "R", "G"] as const;
export function comboKey(ci: readonly string[]): string {
  return WUBRG.filter((c) => ci.includes(c)).join("");
}
export function comboName(ci: readonly string[]): string {
  return COLOR_COMBOS[comboKey(ci)] ?? comboKey(ci);
}

export interface BuiltDeck {
  id: string;
  createdAt: number;
  options: BuildOptions;
  commanders: DeckEntry[];
  cards: DeckEntry[];
  stats: {
    total: number;
    lands: number;
    avgCmc: number;
    curve: number[]; // index = cmc 0..7+
    pips: Record<Color, number>;
    roles: Record<string, number>;
    priceUsd: number;
    gameChangers: string[];
    estimatedBracket?: Bracket;
    power?: PowerRating;
  };
  notes: string[];
  warnings: string[];
  aiSummary?: string;
  aiSwaps?: { out: string; in: string; why: string }[];
  /** Owned, eligible cards that didn't make the cut — ranked, for swapping in. */
  alternatives: DeckEntry[];
  /** EDHREC picks you do NOT own, for a wishlist. */
  wishlist: EdhrecCard[];
  /** Combos fully present in the deck (Commander Spellbook). */
  combos?: Combo[];
  engine: "heuristic" | "ai";
  name?: string;
  /** Set when this deck came from the upgrade tool. */
  upgrade?: UpgradeSummary;
}

export interface SwapReason {
  text: string;
  /** "edhrec" | "theme" | "role" | "curve" | "combo" | "legality" | "commander" | "popularity" */
  kind: string;
}

export interface Swap {
  out: DeckEntry;
  in: DeckEntry;
  gain: number;
  whyIn: SwapReason[];
  whyOut: SwapReason[];
}

export interface UpgradeSummary {
  source: string; // where the original list came from
  originalName: string;
  swaps: Swap[];
  forcedCuts: { name: string; why: string }[];
  before: { avgCmc: number; power?: PowerRating; roles: Record<string, number>; edhrecMatch: number };
  after: { avgCmc: number; power?: PowerRating; roles: Record<string, number>; edhrecMatch: number };
  comboSuggestions: Combo[];
  unresolved: string[];
}

/** Deckbit's own 1–10 power rating with the factors behind it. */
export interface PowerRating {
  score: number; // 1..10
  label: string;
  factors: { label: string; value: string; points: number }[];
}

export interface WishlistItem {
  name: string;
  addedAt: number;
  note?: string;
  forDeck?: string;
}
