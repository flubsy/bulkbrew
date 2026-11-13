import { BASIC_LANDS, isBasic, manaPips } from "../scryfall";
import { FORMATS, THEMES, type BuildOptions, type BuiltDeck, type CardData, type Color, type DeckEntry, type DeckProfile, type EdhrecCard, type ReferenceDeck, type Role } from "../types";
import { commanderHooks, creatureTypes, isCreature, isExtraTurn, isFastMana, isGameChanger, isLand, isMassLandDenial, themeScore } from "./classify";
import { ratePower } from "./power";
import { classifyCard } from "./roles";

/** Everything EDHREC told us for this build. */
export interface EdhrecContext {
  cards: EdhrecCard[];
  averageDeck: string[];
  /** Land count, type split and curve of the average deck for this commander (+ tag). */
  profile?: DeckProfile;
  commanderDecks: number | null;
  commanderName?: string;
  tagLabel?: string;
  /** Same tag across ALL commanders in these colours (e.g. every Grixis spellslinger deck). */
  archetype?: EdhrecCard[];
  archetypeLabel?: string;
  /** Release date of the commander's printing: cards newer than it are under-counted by EDHREC. */
  commanderReleased?: string;
}

export const EMPTY_EDHREC: EdhrecContext = { cards: [], averageDeck: [], commanderDecks: null };

/** The raw facts behind a card's score — used to write human-readable reasons without AI. */
export interface CardFacts {
  edhrec?: EdhrecCard;
  /** Inclusion after correcting for decks built before the card existed. */
  adjustedInclusion?: number;
  archetype?: EdhrecCard;
  inAverageDeck: boolean;
  themes: string[]; // human labels of matched themes
  tribe?: "lord" | "member" | "payoff";
  hooks: string[]; // commander mechanics this card plays into
  refFreq: number;
  staple: boolean;
  roleSource: "tag" | "text";
}

/** A card in the owned pool: one entry per unique name, quantity summed across printings. */
export interface PoolCard {
  card: CardData;
  owned: number;
  priceUsd: number | null; // cheapest owned printing
  sets: string[];
}

export interface Candidate extends PoolCard {
  role: Role;
  score: number;
  reasons: string[];
  flagged: string[]; // bracket / policy flags
  edhrec?: EdhrecCard;
  facts: CardFacts;
  /** Set when the card would normally be filtered out (used by the upgrade tool to force cuts). */
  ineligible?: string;
}

const COLORS: Color[] = ["W", "U", "B", "R", "G"];
/** Own at least this share of EDHREC's average deck and the build starts from it. */
const TEMPLATE_SHARE = 0.4;

export function formatMeta(f: BuildOptions["format"]) {
  return FORMATS.find((x) => x.id === f)!;
}

/** Collapse owned printings into one pool entry per card name. */
export function buildPool(owned: { card?: CardData; quantity: number; sets?: string[] }[]): PoolCard[] {
  const map = new Map<string, PoolCard>();
  for (const o of owned) {
    if (!o.card) continue;
    const key = o.card.name;
    const p = map.get(key);
    const price = o.card.priceUsd;
    if (p) {
      p.owned += o.quantity;
      if (price !== null && (p.priceUsd === null || price < p.priceUsd)) p.priceUsd = price;
      for (const s of o.sets ?? [o.card.setCode]) if (s && !p.sets.includes(s)) p.sets.push(s);
    } else {
      map.set(key, { card: o.card, owned: o.quantity, priceUsd: price, sets: (o.sets ?? [o.card.setCode]).filter(Boolean) });
    }
  }
  return [...map.values()];
}

function legalIn(c: CardData, format: BuildOptions["format"]): boolean {
  const meta = formatMeta(format);
  if (!meta.scryfall) return true;
  const l = c.legalities[meta.scryfall];
  return l === "legal" || l === "restricted";
}

function colorSubset(a: Color[], identity: Set<Color>): boolean {
  return a.every((c) => identity.has(c));
}

export interface FilterReport {
  total: number;
  illegal: number;
  offColor: number;
  excludedSet: number;
  tooPricey: number;
  excluded: number;
  kept: number;
}

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;

/**
 * How much to trust an EDHREC list section. "High synergy" and "top cards" are what this commander's
 * players deliberately run; "new cards" are mostly hype with inflated synergy and few decks behind them.
 */
const SECTION_WEIGHT: Record<string, { mult: number; bonus: number; note?: string }> = {
  "high synergy cards": { mult: 1.25, bonus: 1.5, note: "high synergy" },
  "top cards": { mult: 1.25, bonus: 1.5, note: "top card" },
  "high lift cards": { mult: 1.1, bonus: 0.5 },
  "new cards": { mult: 0.6, bonus: 0 },
};

/**
 * Build a scorer for one deck context. `eligibility(p)` says why a card can't be used (or null);
 * `score(p)` returns the Candidate with its score and the facts behind it.
 * Shared by the builder (pool → deck) and the upgrade tool (bulk vs. an existing list).
 */
export function makeScorer(opts: BuildOptions, refs: ReferenceDeck[], commanders: CardData[], ed: EdhrecContext = EMPTY_EDHREC) {
  const edhrecByName = new Map(ed.cards.map((e) => [e.name.toLowerCase(), e] as const));
  const avg = new Set(ed.averageDeck.map((n) => n.toLowerCase()));
  const archetypeByName = new Map((ed.archetype ?? []).map((e) => [e.name.toLowerCase(), e] as const));
  const cmdReleased = ed.commanderReleased ? Date.parse(ed.commanderReleased) : NaN;
  const meta = formatMeta(opts.format);
  const identity = new Set<Color>();
  if (meta.singleton && commanders.length) {
    for (const c of commanders) c.colorIdentity.forEach((x) => identity.add(x));
  } else if (opts.colors?.length) {
    opts.colors.forEach((x) => identity.add(x));
  } else {
    COLORS.forEach((x) => identity.add(x));
  }

  const exclude = new Set(opts.excludeCards.map((s) => s.toLowerCase()));
  const include = new Set(opts.includeCards.map((s) => s.toLowerCase()));
  const allowedSets = new Set((opts.allowedSets ?? []).map((s) => s.toLowerCase()));

  // Reference deck frequency: how many selected reference decks include each card.
  const refFreq = new Map<string, number>();
  for (const d of refs) {
    const seen = new Set<string>();
    for (const c of d.cards) {
      if (c.board !== "main" && c.board !== "commander") continue;
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      refFreq.set(c.name, (refFreq.get(c.name) ?? 0) + 1);
    }
  }

  const hooks = commanders.flatMap(commanderHooks);
  const cmdTypes = new Set(commanders.flatMap((c) => creatureTypes(c.typeLine)));
  const tribe = opts.tribe || (opts.themes.includes("tribal") ? [...cmdTypes][0] : undefined);
  const commanderNames = new Set(commanders.map((c) => c.name));

  /** Why this card can't go in the deck, or null if it can. */
  function eligibility(p: PoolCard): keyof Omit<FilterReport, "total" | "kept"> | null {
    const c = p.card;
    const lname = c.name.toLowerCase();
    if (exclude.has(lname)) return "excluded";
    if (include.has(lname)) return null;
    if (!legalIn(c, opts.format)) return "illegal";
    if (!colorSubset(c.colorIdentity, identity)) return "offColor";
    if (allowedSets.size && !p.sets.some((s) => allowedSets.has(s)) && !isBasic(c.name)) return "excludedSet";
    if (opts.maxCardPrice && p.priceUsd !== null && p.priceUsd > opts.maxCardPrice && !isBasic(c.name)) return "tooPricey";
    return null;
  }

  function score(p: PoolCard): Candidate {
    const c = p.card;
    const lname = c.name.toLowerCase();
    const forced = include.has(lname);
    const { role, source } = classifyCard(c);
    const reasons: string[] = [];
    const flagged: string[] = [];
    const facts: CardFacts = { inAverageDeck: false, themes: [], hooks: [], refFreq: 0, staple: false, roleSource: source };
    let score = 0;

    // Popularity baseline from Scryfall's EDHREC rank (log scale; rank 1 → ~10, rank 20k → ~0).
    if (c.edhrecRank) {
      const pop = Math.max(0, 10 - Math.log10(c.edhrecRank) * 2.3);
      score += pop;
      if (pop > 6) { reasons.push("staple"); facts.staple = true; }
    } else {
      score += 1;
    }

    // Theme fit.
    const th = themeScore(c, opts.themes, tribe);
    score += th.score;
    reasons.push(...th.reasons);
    for (const r of th.reasons) {
      if (r.endsWith(" lord")) facts.tribe = "lord";
      else if (r.endsWith(" payoff")) facts.tribe = facts.tribe ?? "payoff";
      else if (tribe && r === tribe) facts.tribe = facts.tribe ?? "member";
      else if (THEME_LABEL[r]) facts.themes.push(THEME_LABEL[r]);
    }

    // Commander synergy.
    for (const h of hooks) {
      if (h.pattern.test(c.oracleText) || h.pattern.test(c.typeLine)) {
        score += 2.5;
        reasons.push(`cmdr: ${h.label}`);
        facts.hooks.push(h.label);
      }
    }
    if (cmdTypes.size && creatureTypes(c.typeLine).some((t) => cmdTypes.has(t))) {
      score += 1.5;
    }

    // Reference decks.
    const freq = refFreq.get(c.name) ?? 0;
    facts.refFreq = freq;
    if (freq) {
      score += Math.min(8, 3 + freq * 2.5);
      reasons.push(`in ${freq} ref deck${freq > 1 ? "s" : ""}`);
    }

    // EDHREC: synergy (-1..1) and inclusion (0..1) for this commander/tag.
    const er = edhrecByName.get(lname);
    if (er) {
      facts.edhrec = er;
      const w = SECTION_WEIGHT[er.label ?? ""] ?? { mult: 1, bonus: 0 };
      // EDHREC divides by every deck for this commander, including decks built before the card
      // was printed. For cards newer than the commander, scale inclusion up (capped at ×2).
      let incl = er.inclusion ?? 0;
      const released = c.releasedAt ? Date.parse(c.releasedAt) : NaN;
      if (incl && Number.isFinite(released) && Number.isFinite(cmdReleased) && released > cmdReleased) {
        const now = Date.now();
        const lifeCmd = Math.max(1, now - cmdReleased);
        const lifeCard = Math.max(30 * 86400_000, now - released);
        const factor = Math.min(2, lifeCmd / lifeCard);
        if (factor > 1.15) {
          incl = Math.min(1, incl * factor);
          facts.adjustedInclusion = incl;
        }
      }
      const s = ((er.synergy ?? 0) * 6 + incl * 6 + 1.5) * w.mult + w.bonus;
      score += s;
      reasons.push(er.inclusion !== undefined ? `EDHREC ${Math.round(er.inclusion * 100)}%` : `EDHREC ${er.label ?? "pick"}`);
    }
    // Archetype-wide: how this card does in ALL decks of this tag + colours, whatever the commander.
    // Smaller weight than the commander page, but it rescues strong cards one commander's page under-rates.
    const ar = archetypeByName.get(lname);
    if (ar) {
      facts.archetype = ar;
      const a = Math.max(0, (ar.synergy ?? 0) * 8 + (ar.inclusion ?? 0) * 6);
      score += Math.min(5, a);
      if (a >= 1.5) reasons.push(`archetype ${Math.round((ar.inclusion ?? 0) * 100)}%`);
    }

    // EDHREC average deck: the single strongest "people actually play this here" signal.
    if (avg.has(lname)) {
      facts.inAverageDeck = true;
      score += 4;
      reasons.push("EDHREC average deck");
    }

    // Role usefulness baseline (so interaction isn't crowded out by theme cards).
    const roleBonus: Partial<Record<Role, number>> = { ramp: 2, draw: 2, removal: 2, wipe: 1, counter: 1.5, tutor: 1.5, protection: 1, recursion: 0.5, finisher: 1.5 };
    score += roleBonus[role] ?? 0;

    // Efficiency: cheap interaction and ramp is better.
    if ((role === "ramp" || role === "removal" || role === "counter") && c.cmc <= 2) score += 1.5;
    if (c.cmc >= 7 && role !== "finisher") score -= 2;

    // Bracket policy.
    const bracket = opts.format === "commander" ? opts.bracket ?? 3 : 5;
    if (isGameChanger(c)) {
      flagged.push("game changer");
      if (bracket <= 2) score -= 100;
      else if (bracket === 3) score += 1; // allowed, capped later to 3
      else score += 3;
    }
    if (isExtraTurn(c)) {
      flagged.push("extra turn");
      if (bracket <= 2) score -= 100;
    }
    if (isMassLandDenial(c)) {
      flagged.push("mass land denial");
      if (bracket <= 3) score -= 100;
    }
    if (isFastMana(c)) {
      flagged.push("fast mana");
      if (bracket === 1) score -= 100;
      else if (bracket >= 4) score += 3;
    }
    if (role === "tutor" && bracket <= 2) score -= 3;

    // Budget preference.
    if (opts.preferCheap && p.priceUsd !== null) score -= Math.min(3, p.priceUsd / 10);

    if (forced) { score += 1000; reasons.unshift("must include"); }

    return { ...p, role, score, reasons, flagged, edhrec: er, facts };
  }

  return { eligibility, score, identity, commanderNames, tribe };
}

/** Score every eligible pool card for this build. */
export function scorePool(pool: PoolCard[], opts: BuildOptions, refs: ReferenceDeck[], commanders: CardData[], ed: EdhrecContext = EMPTY_EDHREC): { candidates: Candidate[]; report: FilterReport } {
  const scorer = makeScorer(opts, refs, commanders, ed);
  const report: FilterReport = { total: pool.length, illegal: 0, offColor: 0, excludedSet: 0, tooPricey: 0, excluded: 0, kept: 0 };
  const candidates: Candidate[] = [];
  for (const p of pool) {
    if (scorer.commanderNames.has(p.card.name)) continue;
    const why = scorer.eligibility(p);
    if (why) { report[why]++; continue; }
    candidates.push(scorer.score(p));
  }
  report.kept = candidates.length;
  return { candidates, report };
}

/** Short human-readable reason for a pick, built only from facts (no AI). */
export function describe(c: Candidate, ed: EdhrecContext = EMPTY_EDHREC): string {
  const f = c.facts;
  const bits: string[] = [];
  if (c.reasons[0] === "must include") bits.push("you asked for it");
  const section = SECTION_WEIGHT[f.edhrec?.label ?? ""]?.note;
  if (f.edhrec?.inclusion !== undefined && ed.commanderName) bits.push(`in ${Math.round(f.edhrec.inclusion * 100)}% of ${ed.commanderName} decks${section ? ` (${section})` : ""}`);
  else if (f.edhrec) bits.push(section ? `EDHREC ${section}` : "EDHREC recommends it");
  if (f.adjustedInclusion !== undefined) bits.push(`newer card: ~${Math.round(f.adjustedInclusion * 100)}% of decks built since it came out`);
  if (f.inAverageDeck && !f.edhrec) bits.push("in EDHREC's average deck");
  if (f.archetype && (f.archetype.synergy ?? 0) >= 0.08 && ed.archetypeLabel) bits.push(`strong in ${ed.archetypeLabel} decks generally (+${Math.round((f.archetype.synergy ?? 0) * 100)}% synergy)`);
  if (f.tribe === "lord") bits.push("tribal lord");
  else if (f.tribe === "member") bits.push(`on-tribe`);
  else if (f.tribe === "payoff") bits.push("tribal payoff");
  if (f.themes.length) bits.push(f.themes.slice(0, 2).join(" + "));
  if (f.hooks.length) bits.push(`commander cares about ${f.hooks.slice(0, 2).join(" & ")}`);
  if (f.refFreq) bits.push(`in ${f.refFreq} of your reference decks`);
  if (!bits.length && f.staple) bits.push("format staple");
  if (!bits.length) bits.push(`best ${c.role} left in the pool`);
  return bits.join(" · ");
}

/**
 * Role quotas per format. Commander numbers are for 99 cards. When EDHREC's average deck for the
 * commander is known (`profile`), its land count replaces the fixed one (it already reflects the tag).
 */
export function quotas(format: BuildOptions["format"], themes: BuildOptions["themes"], profile?: DeckProfile): Partial<Record<Role, number>> & { land: number } {
  const singleton = formatMeta(format).singleton;
  if (singleton && formatMeta(format).size === 100) {
    const q: Partial<Record<Role, number>> & { land: number } = { land: 36, ramp: 10, draw: 10, removal: 8, wipe: 2, counter: 0, protection: 2, tutor: 0, recursion: 1, finisher: 3 };
    if (themes.includes("control")) { q.counter = 6; q.wipe = 4; q.draw = 12; }
    if (themes.includes("landfall")) { q.land = 40; q.ramp = 8; }
    if (themes.includes("aggro") || themes.includes("voltron")) { q.land = 34; q.wipe = 0; q.protection = 5; }
    if (themes.includes("combo")) { q.tutor = 5; }
    if (themes.includes("spellslinger")) { q.counter = 3; q.draw = 12; }
    if (profile) q.land = Math.max(30, Math.min(42, Math.round(profile.lands)));
    return q;
  }
  if (format === "oathbreaker") return { land: 21, ramp: 3, draw: 5, removal: 6, wipe: 1, counter: 0, finisher: 2 };
  // 60-card
  const q: Partial<Record<Role, number>> & { land: number } = { land: 23, ramp: 0, draw: 4, removal: 8, wipe: 1, counter: 0, finisher: 3 };
  if (themes.includes("control")) { q.land = 25; q.counter = 8; q.wipe = 3; q.draw = 8; q.removal = 8; }
  if (themes.includes("aggro") || themes.includes("burn")) { q.land = 20; q.draw = 2; q.wipe = 0; }
  if (themes.includes("ramp")) { q.ramp = 8; q.land = 24; }
  return q;
}

export function buildHeuristic(pool: PoolCard[], opts: BuildOptions, refs: ReferenceDeck[], ed: EdhrecContext = EMPTY_EDHREC): BuiltDeck {
  const edhrec = ed.cards;
  const meta = formatMeta(opts.format);
  const notes: string[] = [];
  const warnings: string[] = [];

  // Commanders.
  const commanders: CardData[] = [];
  for (const name of [opts.commander, opts.partner].filter(Boolean) as string[]) {
    const p = pool.find((x) => x.card.name.toLowerCase() === name.toLowerCase());
    if (p) commanders.push(p.card);
    else warnings.push(`Commander "${name}" is not in your collection.`);
  }
  if (meta.singleton && meta.size === 100 && !commanders.length) {
    warnings.push("No commander chosen — pick one from your legendary creatures for a proper build. Building a colour-unrestricted 99 for now.");
  }

  const { candidates, report } = scorePool(pool, opts, refs, commanders, ed);
  notes.push(`Pool: ${report.total} unique cards owned → ${report.kept} eligible (${report.illegal} not legal in ${meta.label}, ${report.offColor} off-colour, ${report.excludedSet} outside chosen sets, ${report.tooPricey} over price cap, ${report.excluded} excluded).`);
  if (edhrec.length) {
    const ownedHits = candidates.filter((c) => c.edhrec).length;
    const avgHits = candidates.filter((c) => c.facts.inAverageDeck).length;
    notes.push(
      `EDHREC${ed.tagLabel ? ` (${ed.tagLabel} decks)` : ""}: ${edhrec.length} recommended cards, ${ownedHits} of them in your eligible pool. ` +
        `You own ${avgHits} of the ${ed.averageDeck.filter((n) => !isBasic(n)).length} non-basic cards in the average deck.`,
    );
  }
  const roleTagged = candidates.filter((c) => c.facts.roleSource === "tag").length;
  notes.push(`Card roles: ${roleTagged} of ${candidates.length} eligible cards classified from Scryfall Tagger, the rest from rules-text patterns.`);

  const target = meta.size - commanders.length;
  const maxCopies = meta.singleton ? 1 : 4;
  const profile = meta.size === 100 ? ed.profile : undefined;
  const q = quotas(opts.format, opts.themes, profile);
  const bracket = opts.format === "commander" ? opts.bracket ?? 3 : 5;
  const gcCap = bracket <= 2 ? 0 : bracket === 3 ? 3 : 99;

  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.card.cmc - b.card.cmc);
  const picked: DeckEntry[] = [];
  const pickedNames = new Set<string>();
  let spend = 0;
  let gcUsed = 0;
  const roleCount: Record<string, number> = {};

  const canAfford = (p: Candidate) => {
    if (!opts.budget) return true;
    const price = p.priceUsd ?? 0;
    return spend + price <= opts.budget;
  };

  const take = (p: Candidate, qty: number, why: string) => {
    if (pickedNames.has(p.card.name)) return false;
    if (p.flagged.includes("game changer")) {
      if (gcUsed >= gcCap) return false;
      gcUsed++;
    }
    if (p.score <= -50) return false;
    if (!canAfford(p)) return false;
    pickedNames.add(p.card.name);
    spend += (p.priceUsd ?? 0) * qty;
    roleCount[p.role] = (roleCount[p.role] ?? 0) + qty;
    picked.push(toEntry(p, qty, why === "mana base" ? why : describe(p, ed)));
    return true;
  };

  const count = () => picked.reduce((s, e) => s + e.quantity, 0);
  const copiesFor = (p: Candidate) => Math.max(1, Math.min(maxCopies, p.owned));

  // Curve caps. With EDHREC's average-deck curve, each mana value gets about the share real lists give it
  // (tight at 5+, looser at 3–4, open at 0–2). Without it, top-heavy themes (Dragons, big mana,
  // reanimator payoffs) get more room at 5+ and an extra land.
  let curveCap: (cmc: number) => number;
  if (profile) {
    const total = Object.values(profile.curve).reduce((s, n) => s + n, 0) || 1;
    const share = (b: number) => Object.entries(profile.curve).filter(([k]) => (b >= 6 ? +k >= 6 : +k === b)).reduce((s, [, n]) => s + n, 0) / total;
    const nl = target - q.land;
    curveCap = (b) => (b <= 2 ? Infinity : b >= 5 ? Math.round(nl * share(b)) + 1 : Math.ceil(nl * share(b) * 1.25) + 1);
    const avgMv = Object.entries(profile.curve).reduce((s, [k, n]) => s + +k * n, 0) / total;
    notes.push(`EDHREC's average ${ed.tagLabel ? `${ed.tagLabel} ` : ""}deck runs ${profile.lands} lands and averages mana value ${avgMv.toFixed(2)}, so the land count and curve caps follow it.`);
  } else {
    const themeCands = sorted.filter((c) => c.reasons.some((r) => r.endsWith(" lord") || r === (opts.tribe ?? "") || r === "ramp" || r === "graveyard"));
    const themeAvg = themeCands.length ? themeCands.reduce((s, c) => s + c.card.cmc, 0) / themeCands.length : 0;
    const topHeavy = themeAvg >= 4.2 || opts.themes.includes("ramp");
    if (topHeavy) notes.push(`Theme skews expensive (avg mana value ${themeAvg.toFixed(1)}), so the curve caps at 5+ were relaxed and a land was added.`);
    if (topHeavy && q.land < 38) q.land += 1;
    const nl = target - q.land;
    curveCap = (cmc) => (cmc >= 6 ? Math.ceil(nl * (topHeavy ? 0.16 : 0.08)) : cmc === 5 ? Math.ceil(nl * (topHeavy ? 0.24 : 0.14)) : Infinity);
  }
  const nonLandTarget = target - q.land;

  // 1. Forced includes.
  for (const p of sorted.filter((x) => x.reasons[0] === "must include")) take(p, copiesFor(p), "must include");

  // 1b. Average deck as a template: if you own a large share of what EDHREC's typical list runs, start
  // from those cards (the most reliable "what good players run" signal) and only backfill the gaps.
  const cmdLower = new Set(commanders.map((c) => c.name.toLowerCase()));
  const avgNonBasic = [...new Set(ed.averageDeck.filter((n) => !isBasic(n)).map((n) => n.toLowerCase()))].filter((n) => !cmdLower.has(n));
  if (avgNonBasic.length >= 30) {
    const ownedLower = new Set(pool.map((p) => p.card.name.toLowerCase()));
    const ownedAvg = avgNonBasic.filter((n) => ownedLower.has(n)).length;
    const share = ownedAvg / avgNonBasic.length;
    if (share >= TEMPLATE_SHARE) {
      let seeded = 0;
      for (const p of sorted) {
        if (count() >= nonLandTarget) break;
        if (!p.facts.inAverageDeck || p.role === "land") continue;
        if (take(p, copiesFor(p), "average deck")) seeded++;
      }
      notes.push(
        `Template: you own ${ownedAvg} of the ${avgNonBasic.length} non-basic cards (${Math.round(share * 100)}%) in EDHREC's average ${ed.tagLabel ? `${ed.tagLabel} ` : ""}deck, ` +
          `so the build starts from the ${seeded} non-land ones that pass your bracket and budget filters, then fills the gaps from your best-scoring cards.`,
      );
    }
  }

  // 2. Fill role quotas (non-land) from best scored.
  const nonLandRoles = (Object.keys(q) as Role[]).filter((r) => r !== "land");
  for (const role of nonLandRoles) {
    const want = q[role] ?? 0;
    for (const p of sorted) {
      if ((roleCount[role] ?? 0) >= want || count() >= nonLandTarget) break;
      if (p.role !== role) continue;
      take(p, copiesFor(p), `${role} slot`);
    }
  }

  // 3. Fill the rest of the non-land slots by score, keeping the curve sane.
  const cmcCount: Record<number, number> = {};
  for (const e of picked) cmcCount[Math.min(6, Math.floor(e.cmc))] = (cmcCount[Math.min(6, Math.floor(e.cmc))] ?? 0) + e.quantity;
  // Soft role ceilings so the fill stage doesn't drown the deck in one role (e.g. 30 mana dorks).
  const roleCeil: Partial<Record<Role, number>> = {
    ramp: (q.ramp ?? 0) + 2, // ramp scores well on paper; past ~12 it crowds out the plan
    draw: Math.ceil((q.draw ?? 0) * 1.5) + 2,
    removal: Math.ceil((q.removal ?? 0) * 1.5) + 2,
    wipe: (q.wipe ?? 0) + 2,
    counter: Math.max(4, (q.counter ?? 0) + 3),
    tutor: Math.max(2, (q.tutor ?? 0) + 2),
    protection: (q.protection ?? 0) + 3,
  };
  // With EDHREC's land count, a hole left by the curve caps is filled by the next-best spell, not an extra land.
  for (const relaxCurve of profile ? [false, true] : [false]) {
    for (const p of sorted) {
      if (count() >= nonLandTarget) break;
      if (p.role === "land") continue;
      const ceil = roleCeil[p.role];
      if (ceil !== undefined && (roleCount[p.role] ?? 0) >= ceil && p.reasons[0] !== "must include") continue;
      const bucket = Math.min(6, Math.floor(p.card.cmc));
      if (!relaxCurve && (cmcCount[bucket] ?? 0) >= curveCap(bucket)) continue;
      const qty = Math.min(copiesFor(p), nonLandTarget - count());
      if (take(p, qty, p.reasons.slice(0, 2).join(", ") || "best available")) cmcCount[bucket] = (cmcCount[bucket] ?? 0) + qty;
    }
  }
  const nonLandsPicked = count();
  if (nonLandsPicked < nonLandTarget) warnings.push(`Only ${nonLandsPicked} eligible non-land cards found for ${nonLandTarget} slots — the collection is thin for this build. Loosen the filters or add cards.`);

  // 4. Lands: pips → colour needs; nonbasics from the pool first, then basics.
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of picked) {
    const pp = manaPips(e.manaCost);
    for (const c of COLORS) pips[c] += pp[c] * e.quantity;
  }
  for (const c of commanders) {
    const pp = manaPips(c.manaCost);
    for (const k of COLORS) pips[k] += pp[k] * 2;
  }
  const colorsUsed = COLORS.filter((c) => pips[c] > 0);
  const identity = new Set<Color>(commanders.length ? commanders.flatMap((c) => c.colorIdentity) : opts.colors?.length ? opts.colors : colorsUsed);

  const landTarget = Math.max(0, Math.min(q.land, target - count()) + Math.max(0, target - q.land - nonLandsPicked));
  const landCands = sorted
    .filter((p) => p.role === "land" && !isBasic(p.card.name))
    .map((p) => {
      let s = p.score;
      const produced = p.card.producedMana.filter((m) => COLORS.includes(m as Color)) as Color[];
      const useful = produced.filter((m) => identity.has(m) && pips[m] > 0).length;
      if (colorsUsed.length >= 2 && useful >= 2) s += 6;
      else if (useful === 1 && colorsUsed.length === 1) s += 2;
      else if (useful === 0 && produced.length > 0) s -= 8;
      if (/enters (the battlefield )?tapped/i.test(p.card.oracleText) && !/unless|if you control/i.test(p.card.oracleText)) s -= 1.5;
      return { p, s };
    })
    .sort((a, b) => b.s - a.s);

  const nonbasicCap = colorsUsed.length >= 2 ? Math.round(landTarget * 0.6) : Math.round(landTarget * 0.35);
  let nonbasics = 0;
  for (const { p, s } of landCands) {
    if (nonbasics >= nonbasicCap) break;
    if (s < 2) break;
    if (take(p, 1, "mana base")) nonbasics++;
  }

  // Basics split by pip share.
  const basicsNeeded = Math.max(0, target - count());
  const totalPips = colorsUsed.reduce((s, c) => s + pips[c], 0) || 1;
  const basicsOwned = (name: string) => pool.find((x) => x.card.name === name)?.owned ?? 0;
  const basicColours = colorsUsed.length ? colorsUsed : [...identity];
  let placed = 0;
  const shares = basicColours.map((c) => ({ c, n: Math.round((basicsNeeded * (pips[c] || 1)) / (colorsUsed.length ? totalPips : basicColours.length)) }));
  // Fix rounding drift.
  let drift = basicsNeeded - shares.reduce((s, x) => s + x.n, 0);
  while (drift !== 0 && shares.length) {
    const i = drift > 0 ? shares.indexOf(shares.reduce((a, b) => (a.n < b.n ? a : b))) : shares.indexOf(shares.reduce((a, b) => (a.n > b.n ? a : b)));
    shares[i].n += drift > 0 ? 1 : -1;
    drift += drift > 0 ? -1 : 1;
  }
  for (const { c, n } of shares) {
    if (n <= 0) continue;
    const name = BASIC_LANDS[c];
    const avail = opts.assumeBasics ? n : Math.min(n, basicsOwned(name));
    if (avail < n && !opts.assumeBasics) warnings.push(`You only own ${basicsOwned(name)} ${name} — ${n} wanted. Enable "assume basics" or add some.`);
    if (avail <= 0) continue;
    const pc = pool.find((x) => x.card.name === name);
    picked.push({
      name,
      quantity: avail,
      role: "land",
      cmc: 0,
      typeLine: `Basic Land — ${name}`,
      manaCost: "",
      priceUsd: 0,
      score: 0,
      reason: "basic",
      scryfallId: pc?.card.scryfallId,
      imageSmall: pc?.card.imageSmall,
      imageNormal: pc?.card.imageNormal,
    });
    placed += avail;
    roleCount.land = (roleCount.land ?? 0) + avail;
  }
  if (count() < target) warnings.push(`Deck is ${count()}/${meta.size - commanders.length + commanders.length} cards. Not enough eligible cards in the collection.`);

  const cmdEntries: DeckEntry[] = commanders.map((c) => ({
    name: c.name,
    quantity: 1,
    role: "commander",
    cmc: c.cmc,
    typeLine: c.typeLine,
    manaCost: c.manaCost,
    priceUsd: pool.find((x) => x.card.name === c.name)?.priceUsd ?? c.priceUsd,
    score: 0,
    reason: "commander",
    scryfallId: c.scryfallId,
    imageSmall: c.imageSmall,
    imageNormal: c.imageNormal,
  }));

  // Alternatives: the best owned cards that didn't make it (and are allowed at this bracket).
  const alternatives = sorted
    .filter((p) => !pickedNames.has(p.card.name) && p.score > -50 && !isBasic(p.card.name))
    .slice(0, 60)
    .map((p) => toEntry(p, 1, describe(p, ed)));

  // Wishlist: EDHREC picks you don't own at all.
  const ownedNames = new Set(pool.map((p) => p.card.name.toLowerCase()));
  const wishlist = edhrec
    .filter((e) => !ownedNames.has(e.name.toLowerCase()) && !isBasic(e.name))
    .sort((a, b) => (b.synergy ?? 0) + (b.inclusion ?? 0) - ((a.synergy ?? 0) + (a.inclusion ?? 0)))
    .slice(0, 40);

  const stats = computeStats(picked, cmdEntries, bracket, gcUsed);
  stats.power = ratePower({ cards: picked, commanders: cmdEntries, stats, options: opts });

  const deck: BuiltDeck = {
    id: `build_${Date.now().toString(36)}`,
    createdAt: Date.now(),
    options: opts,
    commanders: cmdEntries,
    cards: sortDeck(picked),
    stats,
    notes,
    warnings,
    alternatives,
    wishlist,
    engine: "heuristic",
  };
  void placed;
  return deck;
}

export function rankMap(pool: PoolCard[]) {
  return new Map(pool.map((p) => [p.card.name, p.card.edhrecRank] as const));
}

export function toEntry(p: Candidate, qty: number, why: string): DeckEntry {
  return {
    name: p.card.name,
    quantity: qty,
    role: p.role,
    cmc: p.card.cmc,
    typeLine: p.card.typeLine,
    manaCost: p.card.manaCost,
    priceUsd: p.priceUsd,
    score: Math.round(p.score * 10) / 10,
    reason: why,
    scryfallId: p.card.scryfallId,
    imageSmall: p.card.imageSmall,
    imageNormal: p.card.imageNormal,
    gameChanger: p.flagged.includes("game changer") || undefined,
    edhrec: p.edhrec ? { synergy: p.edhrec.synergy, inclusion: p.edhrec.inclusion, label: p.edhrec.label, decks: p.edhrec.decks } : undefined,
    inAverageDeck: p.facts.inAverageDeck || undefined,
  };
}

const ROLE_ORDER: Role[] = ["commander", "creature", "synergy", "ramp", "draw", "removal", "wipe", "counter", "tutor", "protection", "recursion", "finisher", "utility", "land"];

export function sortDeck(cards: DeckEntry[]): DeckEntry[] {
  return [...cards].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.cmc - b.cmc || a.name.localeCompare(b.name));
}

export function computeStats(cards: DeckEntry[], commanders: DeckEntry[], bracket: number, gcUsed: number): BuiltDeck["stats"] {
  const nonLand = cards.filter((c) => c.role !== "land");
  const total = cards.reduce((s, c) => s + c.quantity, 0);
  const lands = cards.filter((c) => c.role === "land").reduce((s, c) => s + c.quantity, 0);
  const nl = nonLand.reduce((s, c) => s + c.quantity, 0) || 1;
  const avgCmc = nonLand.reduce((s, c) => s + c.cmc * c.quantity, 0) / nl;
  const curve = new Array(8).fill(0);
  for (const c of nonLand) curve[Math.min(7, Math.floor(c.cmc))] += c.quantity;
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of [...cards, ...commanders]) {
    const pp = manaPips(c.manaCost);
    for (const k of COLORS) pips[k] += pp[k] * c.quantity;
  }
  const roles: Record<string, number> = {};
  for (const c of cards) roles[c.role] = (roles[c.role] ?? 0) + c.quantity;
  const priceUsd = [...cards, ...commanders].reduce((s, c) => s + (c.priceUsd ?? 0) * c.quantity, 0);
  const gameChangers = cards.filter((c) => c.gameChanger).map((c) => c.name);
  const estimatedBracket = (gcUsed === 0 ? Math.min(bracket, 2) : gcUsed <= 3 ? Math.max(3, Math.min(bracket, 3)) : Math.max(4, bracket)) as BuiltDeck["stats"]["estimatedBracket"];
  return { total, lands, avgCmc: Math.round(avgCmc * 100) / 100, curve, pips, roles, priceUsd: Math.round(priceUsd * 100) / 100, gameChangers, estimatedBracket };
}

export { isCreature, isLand };
