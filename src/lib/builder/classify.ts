import type { CardData, Role, ThemeId } from "../types";

/**
 * Rules-based card classification. Oracle-text regexes are crude but they cover the
 * 90% case; the AI pass (when enabled) corrects the rest.
 */

const re = (s: string) => new RegExp(s, "i");

const R = {
  land: re("\\bLand\\b"),
  creature: re("\\bCreature\\b"),
  manaRock: re("\\{T\\}:? ?Add|Add \\{|add one mana|add two mana|add three mana"),
  landRamp: re("search your library for (a|up to \\w+) (basic )?land|put (a|that) land (card )?onto the battlefield|lands? (card )?from your hand onto the battlefield"),
  draw: re("draw (a|two|three|four|x|\\d+) cards?|draw cards|whenever .* draw"),
  removal: re("(destroy|exile) target (?![^.]*you control)|deals? \\d+ damage to (any target|target creature|target creature or planeswalker|each opponent)|return target (?![^.]*you control)[^.]* to its owner's hand|target (creature|permanent|artifact|enchantment|nonland permanent) (?!you control)[^.]* (gets|loses|can't)|fights? (another )?target|bite|\\-x/\\-x|each opponent sacrifices a (creature|permanent)|target (player|opponent) sacrifices"),
  wipe: re("destroy all|exile all|each creature gets|all creatures get|deals? \\d+ damage to each|sacrifices? all|each player sacrifices|return all"),
  counter: re("counter target (spell|activated|triggered|noncreature|creature)"),
  tutor: re("search your library for (a|an|up to) (?!(basic )?land)[^.]*card"),
  protection: re("hexproof|indestructible|protection from|can't be countered|phase out|regenerate|shroud|ward|prevent all damage|you have hexproof|gain .* indestructible"),
  recursion: re("return (target|a|up to \\w+) [^.]*card[^.]* from your graveyard (to your hand|to the battlefield)|from your graveyard to the battlefield|reanimate|escape|flashback|unearth|persist|undying"),
  finisher: re("you win the game|each opponent loses|double|extra turn|infect|poison|annihilator|overrun|whenever .* deals combat damage to a player"),
  extraTurn: re("take an extra turn|extra turns?"),
  massLandDenial: re("destroy all lands|each player sacrifices \\w+ lands|lands don't untap|destroy target land|sacrifice a land"),
  fastMana: re("^\\{0\\}$|^\\{1\\}$"),
};

export function isLand(c: CardData) {
  return R.land.test(c.typeLine) && !/Creature/.test(c.typeLine.split("//")[0]);
}
export function isCreature(c: CardData) {
  return R.creature.test(c.typeLine);
}

export function classify(c: CardData): Role {
  const t = c.typeLine;
  const o = c.oracleText;
  if (isLand(c)) return "land";
  if (R.wipe.test(o) && !/\bCreature\b/.test(t)) return "wipe";
  if (R.counter.test(o)) return "counter";
  if ((R.manaRock.test(o) && (/Artifact/.test(t) || /Creature/.test(t)) && c.cmc <= 4) || R.landRamp.test(o)) return "ramp";
  if (R.tutor.test(o) && !/Creature/.test(t)) return "tutor";
  if (R.draw.test(o) && !/Creature/.test(t)) return "draw";
  if (R.removal.test(o) && /Instant|Sorcery/.test(t)) return "removal";
  if (R.removal.test(o) && /Enchantment|Artifact/.test(t) && !/Creature/.test(t)) return "removal";
  if (R.recursion.test(o) && !/Creature/.test(t)) return "recursion";
  if (R.protection.test(o) && /Instant/.test(t)) return "protection";
  if (R.finisher.test(o) && (c.cmc >= 5 || /Sorcery/.test(t))) return "finisher";
  if (/Creature/.test(t)) {
    if (R.draw.test(o)) return "draw";
    if (R.manaRock.test(o) && c.cmc <= 3) return "ramp";
    return "creature";
  }
  return "utility";
}

/** Oracle/type patterns per theme. Score = weight when matched. */
export const THEME_PATTERNS: Record<ThemeId, { weight: number; type?: RegExp; oracle?: RegExp; keyword?: RegExp }> = {
  tribal: { weight: 0 }, // handled by tribe matching
  artifacts: { weight: 5, type: /Artifact/, oracle: /artifact/i },
  enchantments: { weight: 5, type: /Enchantment/, oracle: /enchantment|constellation|aura/i },
  counters: { weight: 5, oracle: /\+1\/\+1 counter|proliferate|counters? on/i, keyword: /Proliferate|Evolve|Adapt|Outlast|Mentor|Riot|Bolster|Support|Modular|Graft/ },
  tokens: { weight: 5, oracle: /create[^.]*\b(\d+\/\d+|creature)\b[^.]*tokens?|populate|convoke|creature tokens? you control|tokens you control get/i, keyword: /Afterlife|Fabricate|Amass|Populate|Convoke/ },
  spellslinger: { weight: 5, type: /Instant|Sorcery/, oracle: /instant or sorcery|whenever you cast a noncreature|prowess|magecraft|copy target/i, keyword: /Prowess|Flashback|Storm|Replicate|Overload|Magecraft/ },
  graveyard: { weight: 5, oracle: /from your graveyard|graveyard to the battlefield|mill|self-mill|dredge|delve|escape|unearth|threshold|delirium|undergrowth/i, keyword: /Dredge|Delve|Escape|Unearth|Flashback|Scavenge|Delirium|Threshold|Undergrowth|Disturb|Embalm|Eternalize/ },
  aristocrats: { weight: 5, oracle: /sacrifice a creature|whenever .* dies|whenever a creature you control dies|sacrifice another|when .* dies/i, keyword: /Afterlife|Exploit|Devour|Undying|Persist/ },
  lifegain: { weight: 5, oracle: /gain .* life|lifelink|whenever you gain life|life total|you gain \d+ life/i, keyword: /Lifelink|Extort/ },
  voltron: { weight: 5, type: /Equipment|Aura/, oracle: /equipped creature|enchanted creature|equip|attach|double strike|commander deals combat damage/i, keyword: /Equip|Living weapon|Reconfigure|Bestow|Double strike/ },
  blink: { weight: 5, oracle: /exile .* return (it|that card|those cards) to the battlefield|enters the battlefield|enters, |when .* enters|flicker|blink/i },
  landfall: { weight: 5, type: /\bLand\b/, oracle: /landfall|whenever a land enters|lands? you control|play an additional land|from your graveyard.*land|land card/i, keyword: /Landfall/ },
  control: { weight: 4, oracle: /counter target|destroy target|exile target|draw .* cards?|return target .* to .* hand/i },
  aggro: { weight: 4, oracle: /haste|whenever .* attacks|attacking creatures|first strike|menace|trample|creatures you control get \+/i, keyword: /Haste|Menace|Trample|First strike|Battle cry|Exalted|Raid|Dash|Blitz/ },
  combo: { weight: 4, oracle: /untap target|infinite|untap all|copy|storm|each time|whenever you cast|you win the game|loses the game/i, keyword: /Storm|Cascade/ },
  mill: { weight: 5, oracle: /mills? \d+|mills? x|puts? the top .* cards? of (their|target player's) library into (their|its owner's) graveyard|library into .* graveyard/i, keyword: /Mill/ },
  stax: { weight: 4, oracle: /can't untap|spells cost \{\d\} more|players can't|each opponent can't|can't cast|don't untap|unless (that|its) (player|controller) pays|at the beginning of each (opponent's|player's) upkeep, .* sacrifice/i },
  ramp: { weight: 4, oracle: /add \{|add .* mana|search your library for .* land|untap target land|double the mana|additional land/i },
  wheels: { weight: 5, oracle: /each player discards|discards? (their|your) hand|draw seven|draws? that many cards|whenever an opponent discards|whenever .* discards/i, keyword: /Madness|Hellbent/ },
  burn: { weight: 5, oracle: /deals? \d+ damage to (any target|each opponent|target player|target opponent)|deals? x damage|whenever .* deals damage|deals? damage to each opponent/i },
};

export function themeScore(c: CardData, themes: ThemeId[], tribe?: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const t of themes) {
    if (t === "tribal") {
      if (tribe) {
        const tr = new RegExp(`\\b${escape(tribe)}\\b`, "i");
        const isMember = /Creature/.test(c.typeLine) && tr.test(c.typeLine);
        const caresAbout = tr.test(c.oracleText) || /changeling|creature type of your choice/i.test(c.oracleText);
        if (isMember && caresAbout) { score += 10; reasons.push(`${tribe} lord`); }
        else if (isMember) { score += 8; reasons.push(`${tribe}`); }
        else if (caresAbout) { score += 6; reasons.push(`${tribe} payoff`); }
        else if (/creatures you control/i.test(c.oracleText)) { score += 2; reasons.push("anthem"); }
      }
      continue;
    }
    const p = THEME_PATTERNS[t];
    let hit = false;
    if (p.type?.test(c.typeLine)) hit = true;
    if (p.oracle?.test(c.oracleText)) hit = true;
    if (p.keyword && c.keywords.some((k) => p.keyword!.test(k))) hit = true;
    if (hit) { score += p.weight; reasons.push(t); }
  }
  return { score, reasons };
}

/** Creature types on a card's type line ("Legendary Creature — Elf Druid" → ["Elf","Druid"]). */
export function creatureTypes(typeLine: string): string[] {
  const front = typeLine.split("//")[0];
  if (!/Creature|Tribal|Kindred/.test(front)) return [];
  const after = front.split(/—|-/)[1];
  if (!after) return [];
  return after.trim().split(/\s+/).filter(Boolean);
}

/** Pull mechanics the commander cares about out of its oracle text, to reward synergy. */
export function commanderHooks(c: CardData): { pattern: RegExp; label: string }[] {
  const o = c.oracleText.toLowerCase();
  const hooks: { pattern: RegExp; label: string }[] = [];
  const add = (cond: boolean, pattern: RegExp, label: string) => cond && hooks.push({ pattern, label });
  add(/artifact/.test(o), /artifact/i, "artifacts matter");
  add(/enchantment/.test(o), /enchantment/i, "enchantments matter");
  add(/\+1\/\+1 counter/.test(o), /\+1\/\+1 counter|proliferate/i, "+1/+1 counters");
  add(/token/.test(o), /create .* token/i, "making tokens");
  add(/instant or sorcery|noncreature spell/.test(o), /Instant|Sorcery/, "casting instants & sorceries");
  add(/graveyard/.test(o), /graveyard/i, "the graveyard");
  add(/sacrifice|dies/.test(o), /sacrifice|dies/i, "sacrifice & death triggers");
  add(/gain .* life|life/.test(o) && /gain/.test(o), /gain .* life|lifelink/i, "gaining life");
  add(/equip|aura|attach/.test(o), /Equipment|Aura/, "equipment & auras");
  add(/enters the battlefield|enters,/.test(o), /enters the battlefield|enters,|when .* enters/i, "things entering the battlefield");
  add(/landfall|land enters|lands/.test(o), /\bLand\b/, "lands entering");
  add(/discard/.test(o), /discard/i, "discarding");
  add(/mill/.test(o), /mill/i, "milling");
  add(/attack/.test(o), /whenever .* attacks|haste|extra combat/i, "attacking");
  add(/draw/.test(o), /draw a card|draw cards|draw two/i, "drawing cards");
  add(/damage/.test(o), /deals \d+ damage|whenever .* deals damage/i, "dealing damage");
  add(/\bx\b/.test(o), /\{x\}/i, "X spells");
  add(/flash/.test(o), /Flash/, "flash");
  add(/historic|legendary/.test(o), /Legendary|Saga|Artifact/, "legendaries & artifacts");
  return hooks;
}

export const isGameChanger = (c: CardData) => c.gameChanger;
export const isExtraTurn = (c: CardData) => R.extraTurn.test(c.oracleText);
export const isMassLandDenial = (c: CardData) => R.massLandDenial.test(c.oracleText);
export const isFastMana = (c: CardData) =>
  classify(c) === "ramp" && c.cmc <= 1 && /Artifact/.test(c.typeLine) && !/Creature/.test(c.typeLine);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
