import { isBasic } from "../scryfall";
import { BRACKETS, type BuildOptions, type BuiltDeck, type CardData, type Color, type Combo, type DeckEntry, type Role, type Swap, type SwapReason } from "../types";
import { computeStats, describe, formatMeta, makeScorer, quotas, sortDeck, toEntry, type Candidate, type EdhrecContext, type PoolCard } from "./heuristic";
import { ratePower } from "./power";

/**
 * Upgrade an existing decklist using cards from the user's collection ("bulk").
 * Deterministic: no AI. Every swap and every reason comes from the same scorer the builder uses.
 *
 *   1. Score every card in the current list and every eligible card in the collection.
 *   2. Cards that are illegal / off-colour must go (forced cuts).
 *   3. Repeatedly make the single best swap (biggest score gain), adjusting for role balance
 *      and curve, until the gain drops below the threshold or the swap budget runs out.
 *   4. Explain each swap from the facts behind both scores.
 */

export interface UpgradeOptions {
  maxSwaps: number;
  minGain: number; // minimum score improvement for a swap to be worth making
  protect: string[]; // never cut these
  allowLandSwaps: boolean;
}

export interface UpgradeInput {
  name: string;
  source: string;
  deck: { card: CardData; quantity: number }[]; // main deck, excluding commanders
  commanders: CardData[];
  pool: PoolCard[]; // the user's collection
  build: BuildOptions;
  upgrade: UpgradeOptions;
  ed: EdhrecContext;
  unresolved: string[];
}

const COLORS: Color[] = ["W", "U", "B", "R", "G"];
const ROLE_NAME: Partial<Record<Role, string>> = {
  ramp: "ramp", draw: "card draw", removal: "removal", wipe: "board wipes", counter: "counterspells",
  tutor: "tutors", protection: "protection", recursion: "recursion", finisher: "finishers", creature: "creatures", land: "lands", utility: "utility",
};

interface Slot {
  c: Candidate;
  qty: number;
  basic: boolean;
  adj: number; // score used for swap decisions (lands get mana-base adjustments)
}

export function upgradeDeck(input: UpgradeInput): BuiltDeck {
  const { build, upgrade, ed, commanders } = input;
  const scorer = makeScorer(build, [], commanders, ed);
  const meta = formatMeta(build.format);
  const bracket = build.format === "commander" ? build.bracket ?? 3 : 5;
  const gcCap = bracket <= 2 ? 0 : bracket === 3 ? 3 : 99;
  const q = quotas(build.format, build.themes, meta.size === 100 ? ed.profile : undefined);
  const protect = new Set(upgrade.protect.map((s) => s.toLowerCase()));
  const cmdName = commanders.map((c) => c.name.split(",")[0].split(" // ")[0]).join(" & ") || "this";

  // Pips for land evaluation.
  const identity = scorer.identity;
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const d of input.deck) for (const m of d.card.manaCost.matchAll(/\{([WUBRG])\}/g)) pips[m[1] as Color] += d.quantity;
  const colorsUsed = COLORS.filter((c) => pips[c] > 0 && identity.has(c));

  const landAdj = (c: Candidate) => {
    if (c.role !== "land") return c.score;
    if (isBasic(c.card.name)) return 6;
    let s = c.score;
    const produced = c.card.producedMana.filter((m) => COLORS.includes(m as Color)) as Color[];
    const useful = produced.filter((m) => colorsUsed.includes(m)).length;
    if (colorsUsed.length >= 2 && useful >= 2) s += 6;
    else if (useful === 0 && produced.length > 0) s -= 8;
    if (/enters (the battlefield )?tapped/i.test(c.card.oracleText) && !/unless|if you control/i.test(c.card.oracleText)) s -= 1.5;
    return s;
  };

  // ---- Current list.
  const slots: Slot[] = input.deck.map(({ card, quantity }) => {
    const pc: PoolCard = { card, owned: quantity, priceUsd: card.priceUsd, sets: [card.setCode] };
    const c = scorer.score(pc);
    const why = scorer.eligibility(pc);
    if (why === "illegal" || why === "offColor") c.ineligible = why;
    return { c, qty: quantity, basic: isBasic(card.name), adj: landAdj(c) };
  });
  const inDeck = new Set(slots.map((s) => s.c.card.name.toLowerCase()));
  for (const c of commanders) inDeck.add(c.name.toLowerCase());

  // ---- Bench: owned, eligible, not already in the list.
  const bench: Candidate[] = [];
  for (const p of input.pool) {
    const n = p.card.name.toLowerCase();
    if (inDeck.has(n) || isBasic(p.card.name) || scorer.commanderNames.has(p.card.name)) continue;
    if (scorer.eligibility(p)) continue;
    const c = scorer.score(p);
    if (c.score <= -50) continue;
    bench.push(c);
  }
  bench.sort((a, b) => b.score - a.score);
  const topBench = bench.slice(0, 200);

  // ---- Before snapshot.
  const cmdEntries: DeckEntry[] = commanders.map((c) => ({
    name: c.name, quantity: 1, role: "commander", cmc: c.cmc, typeLine: c.typeLine, manaCost: c.manaCost, priceUsd: c.priceUsd,
    score: 0, reason: "commander", scryfallId: c.scryfallId, imageSmall: c.imageSmall, imageNormal: c.imageNormal,
  }));
  const entriesOf = (list: Slot[]) => list.filter((s) => s.qty > 0).map((s) => toEntry(s.c, s.qty, s.basic ? "basic" : describe(s.c, ed)));
  const snapshot = (list: Slot[]) => {
    const entries = entriesOf(list);
    const gc = entries.filter((e) => e.gameChanger).length;
    const stats = computeStats(entries, cmdEntries, bracket, gc);
    stats.power = ratePower({ cards: entries, commanders: cmdEntries, stats, options: build });
    const nonLand = list.filter((s) => s.c.role !== "land" && s.qty > 0);
    const match = nonLand.filter((s) => s.c.facts.edhrec || s.c.facts.inAverageDeck).length;
    return { stats, entries, edhrecMatch: nonLand.length ? Math.round((match / nonLand.length) * 100) : 0 };
  };
  const before = snapshot(slots);

  // ---- Swap loop.
  const roleCount: Record<string, number> = {};
  for (const s of slots) roleCount[s.c.role] = (roleCount[s.c.role] ?? 0) + s.qty;
  let gcCount = slots.filter((s) => s.c.flagged.includes("game changer")).length;
  const avgCmc = before.stats.avgCmc;
  const used = new Set<string>();
  const swaps: Swap[] = [];
  const forcedCuts: { name: string; why: string }[] = [];
  const landSwapCap = Math.max(1, Math.floor(upgrade.maxSwaps / 3));
  let landSwaps = 0;

  const ineligibleLeft = () => slots.some((s) => s.qty > 0 && s.c.ineligible);

  for (let iter = 0; iter < upgrade.maxSwaps + 20; iter++) {
    const mustFix = ineligibleLeft();
    if (!mustFix && swaps.length >= upgrade.maxSwaps) break;

    let best: { inC: Candidate; out: Slot; gain: number; raw: number } | null = null;
    for (const inC of topBench) {
      if (used.has(inC.card.name)) continue;
      const isGC = inC.flagged.includes("game changer");
      if (isGC && gcCount >= gcCap) continue;
      const inIsLand = inC.role === "land";
      if (inIsLand && (!upgrade.allowLandSwaps || landSwaps >= landSwapCap)) continue;
      const inAdj = landAdj(inC);
      for (const out of slots) {
        if (out.qty <= 0) continue;
        if (protect.has(out.c.card.name.toLowerCase())) continue;
        if (mustFix && !out.c.ineligible) continue; // fix illegal cards first
        const outIsLand = out.c.role === "land";
        if (inIsLand !== outIsLand) continue; // keep the land count stable
        if (out.basic && !inIsLand) continue;
        if (out.basic && colorsUsed.length >= 3) continue; // don't thin basics in 3+ colour decks
        const raw = inAdj - out.adj;
        let gain = raw;
        if (inC.role !== out.c.role) {
          const outQ = q[out.c.role];
          if (outQ && (roleCount[out.c.role] ?? 0) - 1 < outQ) gain -= 3; // would open a hole
          const inQ = q[inC.role];
          if (inQ && (roleCount[inC.role] ?? 0) < inQ) gain += 2; // fills a hole
        }
        if (avgCmc > 3.2 && inC.card.cmc < out.c.card.cmc) gain += 0.3 * (out.c.card.cmc - inC.card.cmc);
        if (out.c.ineligible) gain += 1000;
        if (!best || gain > best.gain) best = { inC, out, gain, raw };
      }
    }
    if (!best) {
      // Nothing can replace a forced cut — cut it anyway and note it.
      const bad = slots.find((s) => s.qty > 0 && s.c.ineligible);
      if (bad) {
        forcedCuts.push({ name: bad.c.card.name, why: `${bad.c.ineligible === "illegal" ? `not legal in ${meta.label}` : "outside the commander's colour identity"}; nothing in your collection could replace it` });
        bad.qty = 0;
        continue;
      }
      break;
    }
    if (!best.out.c.ineligible && best.gain < upgrade.minGain) break;

    // Apply.
    const { inC, out } = best;
    const whyIn = reasonsIn(inC, out.c, ed, cmdName, q, roleCount, gcCount, gcCap, bracket);
    const whyOut = reasonsOut(out.c, inC, ed, cmdName, q, roleCount, meta.label);
    const outEntry = toEntry(out.c, 1, describe(out.c, ed));
    out.qty -= 1;
    roleCount[out.c.role] = (roleCount[out.c.role] ?? 0) - 1;
    roleCount[inC.role] = (roleCount[inC.role] ?? 0) + 1;
    if (inC.flagged.includes("game changer")) gcCount++;
    if (out.c.flagged.includes("game changer")) gcCount--;
    if (inC.role === "land") landSwaps++;
    used.add(inC.card.name);
    slots.push({ c: inC, qty: 1, basic: false, adj: landAdj(inC) });
    swaps.push({ out: outEntry, in: toEntry(inC, 1, describe(inC, ed)), gain: Math.round(best.raw * 10) / 10, whyIn, whyOut });
  }

  const after = snapshot(slots);
  const alternatives = bench.filter((c) => !used.has(c.card.name)).slice(0, 40).map((c) => toEntry(c, 1, describe(c, ed)));
  const owned = new Set(input.pool.map((p) => p.card.name.toLowerCase()));
  const wishlist = ed.cards.filter((e) => !owned.has(e.name.toLowerCase()) && !inDeck.has(e.name.toLowerCase()) && !isBasic(e.name)).sort((a, b) => (b.inclusion ?? 0) - (a.inclusion ?? 0)).slice(0, 30);

  const notes: string[] = [
    `Compared your ${slots.length - swaps.length} unique cards against ${bench.length} eligible cards from your collection.`,
    `EDHREC match (non-land cards that EDHREC lists for ${cmdName}): ${before.edhrecMatch}% → ${after.edhrecMatch}%.`,
  ];
  if (swaps.length < upgrade.maxSwaps && !ineligibleLeft()) notes.push(`Stopped at ${swaps.length} swaps: no remaining card in your collection beats a card in the list by at least ${upgrade.minGain} points.`);
  const warnings: string[] = [];
  if (input.unresolved.length) warnings.push(`Couldn't find on Scryfall (ignored): ${input.unresolved.slice(0, 10).join(", ")}${input.unresolved.length > 10 ? "…" : ""}`);
  if (bracket <= 3 && gcCount > gcCap) warnings.push(`The list has ${gcCount} game changers; ${BRACKETS[bracket - 1].label} allows ${gcCap}. The upgrade didn't add any, but you may want to cut some.`);

  return {
    id: `upg_${Date.now().toString(36)}`,
    createdAt: Date.now(),
    options: build,
    commanders: cmdEntries,
    cards: sortDeck(after.entries),
    stats: after.stats,
    notes,
    warnings,
    alternatives,
    wishlist,
    engine: "heuristic",
    name: `${input.name} (upgraded)`,
    upgrade: {
      source: input.source,
      originalName: input.name,
      swaps,
      forcedCuts,
      before: { avgCmc: before.stats.avgCmc, power: before.stats.power, roles: before.stats.roles, edhrecMatch: before.edhrecMatch },
      after: { avgCmc: after.stats.avgCmc, power: after.stats.power, roles: after.stats.roles, edhrecMatch: after.edhrecMatch },
      comboSuggestions: [],
      unresolved: input.unresolved,
    },
  };
}

/* ----------------------------- Reasons (templated from facts) ----------------------------- */

function pct(x?: number) {
  return x === undefined ? "" : `${Math.round(x * 100)}%`;
}

function reasonsIn(c: Candidate, out: Candidate, ed: EdhrecContext, cmd: string, q: Partial<Record<Role, number>>, roleCount: Record<string, number>, gcCount: number, gcCap: number, bracket: number): SwapReason[] {
  const r: SwapReason[] = [];
  const f = c.facts;
  if (f.edhrec?.inclusion !== undefined) {
    r.push({ kind: "edhrec", text: `Played in ${pct(f.edhrec.inclusion)} of ${cmd} decks on EDHREC${f.edhrec.decks ? ` (${f.edhrec.decks.toLocaleString()} decks)` : ""}${ed.tagLabel ? `, ${ed.tagLabel} builds` : ""}.` });
  }
  if (f.edhrec?.synergy !== undefined && f.edhrec.synergy >= 0.15) {
    r.push({ kind: "edhrec", text: `High synergy (+${pct(f.edhrec.synergy)}): ${cmd} decks play it far more often than other decks in these colours.` });
  }
  if (f.adjustedInclusion !== undefined) r.push({ kind: "edhrec", text: `Newer than ${cmd}: allowing for decks built before it existed, it's in about ${pct(f.adjustedInclusion)} of recent lists.` });
  if (f.inAverageDeck) r.push({ kind: "edhrec", text: `Part of EDHREC's average ${cmd} decklist.` });
  if (f.archetype && (f.archetype.synergy ?? 0) >= 0.08 && ed.archetypeLabel) r.push({ kind: "edhrec", text: `Strong in ${ed.archetypeLabel} decks generally: ${pct(f.archetype.inclusion)} of them run it (+${pct(f.archetype.synergy)} synergy), whatever the commander.` });
  if (f.tribe === "lord") r.push({ kind: "theme", text: "A tribal lord: it's on-type and boosts or rewards the tribe." });
  else if (f.tribe === "member") r.push({ kind: "theme", text: "On-tribe creature for your typal theme." });
  else if (f.tribe === "payoff") r.push({ kind: "theme", text: "Rewards you for playing the tribe." });
  if (f.themes.length) r.push({ kind: "theme", text: `Fits your ${f.themes.slice(0, 2).join(" and ")} theme.` });
  if (f.hooks.length) r.push({ kind: "commander", text: `Feeds what ${cmd} cares about: ${f.hooks.slice(0, 3).join(", ")}.` });
  const want = q[c.role];
  const have = roleCount[c.role] ?? 0;
  if (want && have < want && c.role !== out.role) r.push({ kind: "role", text: `Your list had ${have} ${ROLE_NAME[c.role] ?? c.role}; a typical target is ${want}.` });
  else if (c.role === out.role && ROLE_NAME[c.role] && c.role !== "creature" && c.role !== "utility") r.push({ kind: "role", text: `Same job (${ROLE_NAME[c.role]}), better version for this deck.` });
  if (c.card.cmc + 1 <= out.card.cmc && c.role !== "land") r.push({ kind: "curve", text: `Cheaper: ${c.card.cmc} mana vs ${out.card.cmc}.` });
  if (f.staple && !f.edhrec && c.card.edhrecRank) r.push({ kind: "popularity", text: `A format staple (#${c.card.edhrecRank.toLocaleString()} most-played card on EDHREC).` });
  if (c.flagged.includes("game changer")) r.push({ kind: "bracket", text: `Game changer: ${gcCount + 1} of ${gcCap === 99 ? "unlimited" : gcCap} allowed at bracket ${bracket}.` });
  if (!r.length) r.push({ kind: "score", text: `Scores higher overall (${c.score.toFixed(1)} vs ${out.score.toFixed(1)}).` });
  return r;
}

function reasonsOut(c: Candidate, inC: Candidate, ed: EdhrecContext, cmd: string, q: Partial<Record<Role, number>>, roleCount: Record<string, number>, formatLabel: string): SwapReason[] {
  const r: SwapReason[] = [];
  const f = c.facts;
  if (c.ineligible === "illegal") r.push({ kind: "legality", text: `Not legal in ${formatLabel}.` });
  if (c.ineligible === "offColor") r.push({ kind: "legality", text: `Outside ${cmd}'s colour identity.` });
  if (ed.cards.length) {
    if (!f.edhrec && !f.inAverageDeck) r.push({ kind: "edhrec", text: `Not among the ~${ed.cards.length} cards EDHREC lists for ${cmd}.` });
    else if (f.edhrec?.inclusion !== undefined && f.edhrec.inclusion < 0.1) r.push({ kind: "edhrec", text: `Only in ${pct(f.edhrec.inclusion)} of ${cmd} decks.` });
  }
  if (!f.themes.length && !f.hooks.length && !f.tribe && c.role !== "land") r.push({ kind: "theme", text: "No link to the commander or your theme." });
  const want = q[c.role];
  const have = roleCount[c.role] ?? 0;
  if (want && have > want + 1) r.push({ kind: "role", text: `Plenty of ${ROLE_NAME[c.role] ?? c.role} already (${have}; target ${want}).` });
  if (c.card.cmc >= 6 && c.role !== "finisher" && c.role !== "land") r.push({ kind: "curve", text: `Expensive at ${c.card.cmc} mana for what it does here.` });
  if (c.role === "land" && isBasic(c.card.name)) r.push({ kind: "role", text: "A basic: swapping it for a utility land keeps the land count the same." });
  if (!r.length) r.push({ kind: "score", text: `Weakest card in its slot (${c.score.toFixed(1)} vs ${inC.score.toFixed(1)}).` });
  return r;
}

/** Combos you could complete from your collection, given the upgraded list. */
export function comboSuggestions(included: Combo[], deckNames: Set<string>, bracket: number): Combo[] {
  if (bracket <= 2) return [];
  return included
    .map((c) => ({ ...c, missing: c.cards.filter((n) => !deckNames.has(n.toLowerCase())) }))
    .filter((c) => c.missing.length > 0 && c.missing.length <= 2 && c.missing.length < c.cards.length)
    .sort((a, b) => a.missing.length - b.missing.length || (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 8);
}
