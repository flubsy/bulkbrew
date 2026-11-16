import { comboName, THEMES, type CardData, type Color, type ThemeId } from "../types";
import { creatureTypes, THEME_PATTERNS } from "./classify";

/**
 * Runs in the browser: rank the user's legal commanders by fit for the chosen themes/tribe,
 * and record *why* — the exact rules-text phrase that matched — so the UI can show it.
 */

export interface Evidence {
  label: string; // "Tokens", "Dragon lord"
  quote?: string; // the matching phrase from the card's rules text
}

export interface CommanderOption {
  name: string;
  typeLine: string;
  ci: Color[];
  combo: string;
  cmc: number;
  imageNormal?: string;
  fit: number;
  evidence: Evidence[];
}

/** Commander-specific phrasing: what in a commander's text says "build around X". */
const THEME_WORDS: Partial<Record<ThemeId, RegExp>> = {
  artifacts: /artifacts? you control|artifact spell|whenever an artifact|for each artifact|artifacts? (enter|you cast)/i,
  enchantments: /enchantments? you control|enchantment spell|whenever an enchantment|constellation|auras? you control/i,
  counters: /\+1\/\+1 counters?|proliferate|counters? on (it|creatures|each)/i,
  // Creature tokens only: Treasure/Food/Clue/Blood tokens aren't "go wide".
  tokens: /create[^.]*\b(\d+\/\d+|creature)\b[^.]*tokens?|creature tokens? you control|tokens you control get|populate|for each creature token/i,
  spellslinger: /instant (or|and) sorcery|noncreature spell|whenever you cast (an instant|a sorcery|your second)|copy (target|that) (instant|spell)|magecraft/i,
  graveyard: /from your graveyard|cards? in your graveyard|mills?|return[^.]*graveyard to the battlefield/i,
  aristocrats: /sacrifice (a|another) (creature|permanent)|whenever (a|another) creature (you control )?dies|dies,/i,
  lifegain: /whenever you gain life|gain (\d+|that much|x) life|lifelink|life total/i,
  voltron: /equipped|equipment|enchanted creature|aura|commander damage|double strike|can't be blocked/i,
  blink: /exile[^.]*return (it|that card|them) to the battlefield|enters the battlefield|whenever [^.]* enters/i,
  landfall: /landfall|whenever a land enters|lands? you control|play an additional land|land cards?/i,
  control: /counter target|return target [^.]* to its owner's hand|destroy target|tap target/i,
  aggro: /haste|whenever [^.]* attacks|attacking creatures|additional combat|menace|trample/i,
  combo: /untap (target|all|each)|copy|storm|you win the game|whenever you cast/i,
  mill: /mills?|top [^.]* cards? of (their|target player's|each opponent's) library into/i,
  stax: /can't (cast|untap|attack)|don't untap|costs? \{\d\} more|unless [^.]* pays/i,
  ramp: /add \{|additional land|untap target land|mana of any|\{x\}/i,
  wheels: /discards?|draw seven|each player draws|whenever an opponent draws/i,
  burn: /deals? (\d+|x|that much) damage|whenever [^.]* deals damage|damage to each opponent|any target/i,
  cascade: /\bcascade\b|\bdiscover\b|cast (it|that card|them) without paying (its|their) mana cost|exile cards from the top of your library until/i,
  storm: /\bstorm\b|copy (that|target|it)[^.]*spell|whenever you cast your (second|third)|spells you cast cost/i,
  treasure: /\btreasures?\b/i,
  flying: /creatures? (you control )?with flying|flying creatures|gains? flying/i,
  flash: /\bflash\b|during (each|an) opponent's turn/i,
  combat: /additional combat|extra combat|untap all (creatures|attacking)/i,
  infect: /\binfect\b|\btoxic\b|poison counters?/i,
  superfriends: /planeswalkers? you control|loyalty (abilities|counters?)|planeswalker spell/i,
  vehicles: /\bvehicles?\b|\bcrew/i,
  theft: /gain control of|you don't own|cards? (your opponents own|an opponent owns)|cast [^.]* exiled with/i,
  goad: /\bgoad|attacks each combat if able|attack a player other than you/i,
  clones: /as a copy|token that'?s a copy|becomes a copy|copy of (target|another)/i,
  impulse: /exile the top [^.]* cards? of your library|you may (play|cast) (that card|those cards|them|cards exiled)/i,
  sagas: /\bsagas?\b|lore counters?/i,
  energy: /\{E\}|energy counters?/i,
  monarch: /\bmonarch\b|the initiative/i,
};

const LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;

function quote(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, m.index - 18)) + 1);
  const endIdx = text.indexOf(" ", Math.min(text.length, m.index + m[0].length + 18));
  const end = endIdx === -1 ? text.length : endIdx;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Can this card lead a deck? Commander rule 903.3 since Edge of Eternities: a legendary creature,
 * a legendary Vehicle, or a legendary Spacecraft with power/toughness (e.g. Hearthhull, the
 * Worldseed), or any card that says it can be your commander. Brawl also allows legendary
 * planeswalkers; Oathbreaker is led by a planeswalker. Only the front face counts.
 * The type line is checked word by word, so "Legendary Artifact Creature" and
 * "Legendary Enchantment Creature" count too.
 */
export function isCommanderCard(card: CardData, format: string): boolean {
  const front = card.typeLine.split("//")[0];
  const [supertypes] = front.split(/\s+[—-]\s+/);
  const legendary = /\bLegendary\b/.test(supertypes);
  const ok =
    /can be your commander/i.test(card.oracleText) ||
    (legendary && /\bCreature\b/.test(supertypes)) ||
    (legendary && /\bVehicle\b/.test(front)) ||
    (legendary && /\bSpacecraft\b/.test(front) && card.power != null && card.toughness != null) ||
    (format === "brawl" && legendary && /\bPlaneswalker\b/.test(supertypes)) ||
    (format === "oathbreaker" && /\bPlaneswalker\b/.test(supertypes));
  if (!ok) return false;
  if (format === "commander" && card.legalities.commander !== "legal") return false;
  if (format === "brawl" && card.legalities.brawl !== "legal") return false;
  return true;
}

/** What a commander's own text says it wants — used for the randomizer's fallback tag and the row chips. */
export function detectThemes(card: CardData): { theme: ThemeId; quote?: string }[] {
  const out: { theme: ThemeId; quote?: string }[] = [];
  for (const [t, re] of Object.entries(THEME_WORDS) as [ThemeId, RegExp][]) {
    const q = quote(card.oracleText, re);
    if (q) out.push({ theme: t, quote: q });
  }
  return out;
}

export function suggestCommanders(cards: CardData[], format: string, themes: ThemeId[], tribe?: string): CommanderOption[] {
  const map = new Map<string, CommanderOption>();
  for (const card of cards) {
    if (!isCommanderCard(card, format) || map.has(card.name)) continue;
    let fit = 0;
    const evidence: Evidence[] = [];
    const o = card.oracleText;
    for (const t of themes) {
      if (t === "tribal") {
        if (!tribe) continue;
        const tr = new RegExp(`\\b${tribe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
        const own = creatureTypes(card.typeLine).some((x) => x.toLowerCase() === tribe.toLowerCase());
        const q = quote(o, tr);
        if (own && q) { fit += 8; evidence.push({ label: `${tribe} lord`, quote: q }); }
        else if (q) { fit += 6; evidence.push({ label: `Cares about ${tribe}s`, quote: q }); }
        else if (own) { fit += 2; evidence.push({ label: `Is a ${tribe}` }); }
        continue;
      }
      const re = THEME_WORDS[t];
      const p = THEME_PATTERNS[t];
      const q = (re && quote(o, re)) || (p.oracle && quote(o, p.oracle));
      const kw = p.keyword && card.keywords.find((k) => p.keyword!.test(k));
      if (q || kw) {
        fit += q && re?.test(o) ? 6 : 3;
        evidence.push({ label: LABEL[t] ?? t, quote: q ?? `Keyword: ${kw}` });
      }
    }
    map.set(card.name, {
      name: card.name,
      typeLine: card.typeLine,
      ci: card.colorIdentity,
      combo: comboName(card.colorIdentity),
      cmc: card.cmc,
      imageNormal: card.imageNormal,
      fit,
      evidence,
    });
  }
  return [...map.values()];
}

/* ----------------------------- Partners & backgrounds ----------------------------- */

type PairKind = "partner" | "partnerWith" | "friends" | "background" | "companion" | "doctor";

/** How a commander can pair up, from its keywords, rules text and type line. */
export function pairKinds(c: CardData): { kind: PairKind; with?: string }[] {
  const o = c.oracleText;
  const out: { kind: PairKind; with?: string }[] = [];
  const pw = /Partner with ([^\n(]+?)(?:\s*\(|\n|$)/.exec(o);
  if (pw) out.push({ kind: "partnerWith", with: pw[1].trim() });
  else if (c.keywords.includes("Partner") || /^Partner(\s*\(|$)/m.test(o)) out.push({ kind: "partner" });
  if (/Friends forever/i.test(o) || c.keywords.includes("Friends forever")) out.push({ kind: "friends" });
  if (/Choose a Background/i.test(o)) out.push({ kind: "background" });
  if (/Doctor's companion/i.test(o) || c.keywords.includes("Doctor's companion")) out.push({ kind: "companion" });
  if (/\bTime Lord Doctor\b/.test(c.typeLine.split("//")[0])) out.push({ kind: "doctor" });
  return out;
}

/**
 * Legal second commanders for `self` from your cards, following each pairing rule:
 * Partner ↔ Partner, "Partner with X" → X only, Friends forever ↔ Friends forever,
 * "Choose a Background" → Background enchantments, Doctor's companion ↔ Time Lord Doctors.
 */
export function partnerOptions(self: CardData, cards: CardData[], format: string): CardData[] {
  const kinds = pairKinds(self);
  if (!kinds.length) return [];
  const legal = (c: CardData) => (format === "commander" ? c.legalities.commander === "legal" : format === "brawl" ? c.legalities.brawl === "legal" : true);
  const out = new Map<string, CardData>();
  for (const c of cards) {
    if (c.name === self.name || out.has(c.name) || !legal(c)) continue;
    const theirs = pairKinds(c).map((k) => k.kind);
    const isBackground = /\bBackground\b/.test(c.typeLine.split("//")[0]) && /\bLegendary\b/.test(c.typeLine);
    const ok = kinds.some((k) => {
      switch (k.kind) {
        case "partnerWith": return c.name.toLowerCase() === k.with!.toLowerCase();
        case "partner": return theirs.includes("partner") && isCommanderCard(c, format);
        case "friends": return theirs.includes("friends") && isCommanderCard(c, format);
        case "background": return isBackground;
        case "companion": return theirs.includes("doctor") && isCommanderCard(c, format);
        case "doctor": return theirs.includes("companion") && isCommanderCard(c, format);
      }
    });
    if (ok) out.set(c.name, c);
  }
  return [...out.values()].sort((a, b) => (a.edhrecRank ?? 1e9) - (b.edhrecRank ?? 1e9) || a.name.localeCompare(b.name));
}

export const PAIR_LABEL: Record<PairKind, string> = {
  partner: "Partner", partnerWith: "Partner with", friends: "Friends forever", background: "Background", companion: "Doctor's companion", doctor: "Doctor",
};
