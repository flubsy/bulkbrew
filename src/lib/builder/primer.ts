import type { BuiltDeck, CardData, Combo, DeckEntry, Primer, ThemeId } from "../types";
import { THEMES } from "../types";
import { FINISHER_LABEL, finisherKind, type FinisherKind } from "./classify";
import { detectThemes } from "./commanders";
import { cardTags } from "./tags";

/**
 * "How this deck works" — a primer written entirely from data:
 *  - the commander's own rules text (what it asks for),
 *  - the deck's theme / EDHREC tag (canned strategy notes per archetype),
 *  - each card's role, mana value and EDHREC standing,
 *  - Commander Spellbook combos (with their step-by-step instructions).
 * No AI. Good enough to explain a list to a friend; not a substitute for a hand-written primer.
 */

const STRATEGY: Partial<Record<ThemeId | string, string>> = {
  tribal: "Flood the board with creatures of one type, let the lords and payoffs make each one bigger than it looks, then swing.",
  tokens: "Go wide with creature tokens, then turn the army into damage with an anthem, an overrun effect or sacrifice payoffs.",
  counters: "Put +1/+1 counters on everything, multiply them, and win with a few huge threats that are hard to block.",
  artifacts: "Churn out cheap artifacts and treasures, use them for mana and value, and let artifact payoffs snowball.",
  enchantments: "Cast enchantments that each draw a card or add value; the board becomes an engine opponents struggle to remove.",
  spellslinger: "Chain cheap instants and sorceries; every spell triggers your payoffs, so the turn you go off you copy, draw and burn your way through.",
  graveyard: "Fill your graveyard on purpose, then bring the best things back for far less than they cost.",
  aristocrats: "Make fodder, sacrifice it for value, and drain the table one death trigger at a time.",
  lifegain: "Gain life constantly and let each gain trigger a payoff, until the payoffs end the game.",
  voltron: "Suit up your commander with equipment and auras, protect it, and win with commander damage.",
  blink: "Flicker creatures to reuse their enter-the-battlefield effects and grind out value every turn.",
  landfall: "Play extra lands and fetch them; every land drop triggers payoffs that turn into damage or card advantage.",
  control: "Answer what matters, draw cards, and win late once opponents have run out of threats.",
  aggro: "Deploy threats fast and attack every turn before opponents can stabilise.",
  combo: "Assemble a game-winning combination of cards, using tutors and draw to find the pieces and protection to resolve them.",
  mill: "Empty opponents' libraries; once a player can't draw, they lose.",
  stax: "Slow everyone else down with taxes and restrictions your own deck is built to ignore.",
  ramp: "Accelerate your mana early, then cast threats a turn or two before anyone else can.",
  wheels: "Refill everyone's hand repeatedly and punish opponents for drawing and discarding.",
  burn: "Ping and burn opponents (and their creatures) a little at a time until the damage adds up.",
  cascade: "Cast spells that cascade or discover into free spells, so every turn is two or three spells for the price of one. Keep cheap cards few so the free hits are good ones.",
  storm: "Build up mana with rituals and cost reducers, chain cheap spells in one big turn, then finish with a storm count or copy payoff.",
  combat: "Take extra combat steps and untap your attackers, so each turn hits like two.",
  infect: "Win with poison: ten counters kills a player, so evasive infect and toxic creatures plus proliferate end games fast.",
  superfriends: "Land several planeswalkers, protect them, and proliferate their loyalty until their ultimates win the game.",
  vehicles: "Crew a fleet of big Vehicles with cheap creatures; they dodge sorcery-speed removal and hit hard.",
  theft: "Steal opponents' best threats and cast their cards, so their own deck beats them.",
  goad: "Force opponents to attack each other, and let the table do your fighting while you build up.",
  clones: "Copy the best creature on the table, and your own value engines, for twice the effect.",
  impulse: "Exile cards off the top and play them that turn: card advantage that keeps you casting every turn.",
  sagas: "Play Sagas for a chapter of value each turn, and reset or proliferate them to get more.",
  energy: "Gather energy counters, then spend them on payoffs that grow and draw.",
  monarch: "Take the monarch or the initiative early and hold it with blockers and removal: an extra card or dungeon room every turn.",
  flash: "Hold mana up and play at instant speed: flash in threats at end of turn and keep answers ready.",
  treasure: "Make Treasure tokens constantly, use them to ramp into big threats, and let artifact payoffs pay off.",
  dragons: "Ramp into Dragons, protect the board, and close the game in the air.",
  flying: "Win in the air with evasive creatures while the ground stalls.",
};

const LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;

/** "a, b and c" */
function list(items: string[], last = "and") {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

function names(list: DeckEntry[], n: number) {
  return list.slice(0, n).map((c) => c.name);
}

function strength(c: DeckEntry) {
  return (c.edhrec?.synergy ?? 0) * 10 + (c.edhrec?.inclusion ?? 0) * 6 + (c.inAverageDeck ? 3 : 0) + c.score * 0.2;
}

/** Short tag for a key card: what it does here, in two or three words. */
function shortWhy(c: DeckEntry): string {
  if (c.gameChanger) return "game changer";
  if ((c.edhrec?.synergy ?? 0) >= 0.25) return "high synergy";
  const byRole: Partial<Record<string, string>> = {
    ramp: "ramp", draw: "card advantage", removal: "removal", wipe: "board wipe", counter: "counterspell", tutor: "tutor",
    protection: "protection", recursion: "recursion", finisher: "finisher",
  };
  return byRole[c.role] ?? (c.inAverageDeck || c.edhrec ? "core piece" : "engine");
}

/**
 * Per kind of finisher: how it ends the game, and the board to aim for before casting it.
 * `n` has the deck's own counts so the advice uses real numbers.
 */
type Counts = { creatures: number; tokenMakers: number; outlets: string[]; drawEngines: string[]; proliferate: string[]; spells: number };
const FINISH: Record<FinisherKind, { how: string; board: (n: Counts) => string }> = {
  overrun: {
    how: "Pumps your whole team at once for one big attack, usually lethal across the table when you go wide.",
    board: (n) => `6+ creatures on board (tokens count), then cast it in your main phase before attacking, ideally when opponents are tapped low or have just wiped. You have ${n.creatures} creatures${n.tokenMakers ? ` and ${n.tokenMakers} token makers` : ""} to get there.`,
  },
  drain: {
    how: "Drains every opponent at once, so damage adds up across the table instead of one player at a time.",
    board: (n) => (n.outlets.length ? `A sacrifice outlet (${list(n.outlets.slice(0, 3), "or")}) and a wide board, then sacrifice everything in one turn to finish.` : "As many triggers lined up as you can; a free sacrifice outlet turns a board of creatures into a lethal burst."),
  },
  burn: {
    how: "Deals damage to each opponent at once, and grows with the number of triggers or the mana you put in.",
    board: (n) => `Opponents around half life: build up triggers over a few turns and fire it as reach once combat has worn them down.${n.spells >= 15 ? ` ${n.spells} instants and sorceries keep it fed.` : ""}`,
  },
  altwin: {
    how: "Wins the game outright once its condition is met, regardless of life totals.",
    board: () => "The condition met, with protection or a counterspell held up so it survives until it checks.",
  },
  infect: {
    how: "Poison: ten counters knocks a player out no matter their life total, so infect damage counts ten times as much as normal damage.",
    board: (n) => `One target at a time: focus poison on them. Evasion and pump spells close the gap fast${n.proliferate.length ? `; ${list(n.proliferate.slice(0, 2))} add${n.proliferate.length === 1 ? "s" : ""} a counter to every poisoned player` : ""}.`,
  },
  combat: {
    how: "Extra combat steps double (or triple) a turn's damage: the attackers untap and swing again.",
    board: () => "A board that can already deal about half of what you need; the second attack does the rest.",
  },
  mill: {
    how: "Empties libraries: a player who has to draw from an empty library loses.",
    board: () => "Libraries already low: mill a little each turn and save the big mill for last. Watch for cards that shuffle graveyards back.",
  },
  drawdrain: {
    how: "Every card you draw pings each opponent, so a big draw turn turns straight into damage.",
    board: (n) => (n.drawEngines.length ? `It on the battlefield before a big draw turn: ${list(n.drawEngines.slice(0, 3))}.` : "A big draw spell or a wheel to follow it; on its own it only chips away."),
  },
  threat: {
    how: "A big threat that ends games in two or three swings if it isn't answered.",
    board: () => "Opponents tapped out or just out of removal when you cast it, and protection held up the turn after.",
  },
};

const WIN_WORDS = /win|damage|life|lose|mill|combat|poison|counter on each opponent/i;

/** Plain-English line for a combo's result. */
function comboResult(c: Combo): string {
  const r = c.produces.slice(0, 3).map((x) => x.toLowerCase());
  return r.length ? `${r.join(", ").replace(/^./, (m) => m.toUpperCase())}.` : "A loop Commander Spellbook lists as a combo.";
}

export function buildPrimer(deck: Pick<BuiltDeck, "cards" | "commanders" | "stats" | "options" | "combos">, commanderCards: CardData[], tagLabel?: string, cardData: CardData[] = []): Primer {
  const cards = deck.cards;
  const nonLand = cards.filter((c) => c.role !== "land");
  const count = (role: string) => cards.filter((c) => c.role === role).reduce((s, c) => s + c.quantity, 0);
  const cmd = deck.commanders.map((c) => c.name.split(",")[0].split(" // ")[0]).join(" & ") || "This deck";
  const cmdCard = commanderCards[0];
  const combos: Combo[] = deck.combos ?? [];
  const ramp = count("ramp");
  const lands = deck.stats.lands;

  // ---- What the commander wants (from its own text).
  const wants = cmdCard ? detectThemes(cmdCard).slice(0, 3) : [];
  const themeIds = deck.options.themes;
  const tagKey = deck.options.edhrecTag ?? (deck.options.tribe ? "tribal" : themeIds[0]);
  const strategy = (tagKey && STRATEGY[tagKey]) || (themeIds[0] && STRATEGY[themeIds[0]]) || (wants[0] && STRATEGY[wants[0].theme]);

  // One line per idea: the strategy, what the commander asks for, then tempo (when it lands and the curve).
  const plan: string[] = [];
  if (strategy) plan.push(strategy);
  if (wants.length) {
    const themes = wants.map((w) => LABEL[w.theme]?.toLowerCase() ?? w.theme);
    plan.push(`${cmd} cares about ${list(themes)}: “${wants[0].quote}”`);
  }
  const cmdTurn = cmdCard ? Math.max(2, Math.round(cmdCard.cmc - Math.min(2, ramp / 6))) : null;
  const curve = deck.stats.avgCmc >= 3.6 ? `a high curve (${deck.stats.avgCmc.toFixed(2)}), so keep ramp-heavy hands` : deck.stats.avgCmc <= 2.8 ? `a low curve (${deck.stats.avgCmc.toFixed(2)}), so you can cast several spells a turn from turn 3` : "";
  if (cmdTurn) plan.push(`${ramp} ramp and ${lands} lands put ${cmd} out around turn ${cmdTurn}${curve ? `, with ${curve}` : ""}.`);
  else if (curve) plan.push(`The deck has ${curve}.`);

  // ---- Key cards: the engines that make the deck tick (just a short tag each).
  const keyCards = [...nonLand]
    .filter((c) => c.role !== "ramp" || (c.edhrec?.synergy ?? 0) > 0.2)
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, 5)
    .map((c) => ({ name: c.name, why: shortWhy(c) }));

  // ---- How it wins. One entry per route: each combo, each kind of finisher, the commander
  // itself, else the big threats. Every entry says how it ends the game, the board to aim for,
  // and what in the list helps set it up.
  const data = new Map([...cardData, ...commanderCards].map((c) => [c.name.toLowerCase(), c] as const));
  const oracle = (name: string) => data.get(name.toLowerCase())?.oracleText ?? "";
  const by = (pred: (c: DeckEntry) => boolean) => nonLand.filter(pred).sort((a, b) => strength(b) - strength(a));
  const tutors = names(by((c) => c.role === "tutor"), 3);
  const shields = names(by((c) => c.role === "protection" || c.role === "counter"), 3);
  const counts: Counts = {
    creatures: cards.filter((c) => /Creature/.test(c.typeLine)).reduce((s, c) => s + c.quantity, 0),
    tokenMakers: nonLand.filter((c) => /create[^.]*\btoken/i.test(oracle(c.name))).length,
    outlets: names(by((c) => /sacrifice (a|another) creature:/i.test(oracle(c.name))), 3),
    drawEngines: names(by((c) => c.role === "draw" || /draws? (two|three|seven|x|cards)|each player draws/i.test(oracle(c.name))), 3),
    proliferate: names(by((c) => /\bproliferate\b/i.test(oracle(c.name))), 2),
    spells: nonLand.filter((c) => /Instant|Sorcery/.test(c.typeLine)).reduce((s, c) => s + c.quantity, 0),
  };
  // Cards that turn endless death/enter/token triggers into a win (Blood Artist-style drains).
  const payoffs = names(by((c) => /whenever [^.]*(dies|enters|leaves)[^.]*(each opponent loses|loses \d+ life|deals? \d+ damage)/i.test(oracle(c.name))), 3);
  const sinks = names(by((c) => /\{X\}/.test(c.manaCost) || /\{X\}[^.]*:/.test(oracle(c.name))), 2);
  const winCons: Primer["winCons"] = [];

  // Combos: the most-played (and featured) first, three at most.
  for (const c of combos.slice(0, 3)) {
    const winsOnItsOwn = c.produces.some((x) => WIN_WORDS.test(x));
    const finisherPiece = c.cards.find((n) => nonLand.some((e) => e.name === n && e.role === "finisher"));
    const how = [comboResult(c)];
    const triggerKind = c.produces.map((x) => /infinite (death|sacrifice|etb|enter|creature token|token)/i.exec(x)?.[1]?.toLowerCase()).find(Boolean);
    if (!winsOnItsOwn && triggerKind && payoffs.length) how.push(`With ${list(payoffs.slice(0, 2), "or")} out, the endless ${triggerKind === "etb" || triggerKind === "enter" ? "enter" : triggerKind.startsWith("creature") || triggerKind === "token" ? "token" : triggerKind} triggers drain the table: that's the kill.`);
    else if (!winsOnItsOwn && c.produces.some((x) => /infinite (\w+ )?mana/i.test(x))) how.push(sinks.length ? `Infinite mana doesn't win on its own: pour it into ${list(sinks, "or")}.` : "Infinite mana doesn't win on its own: you need something to spend it on, like an X spell or an activated ability.");
    else if (!winsOnItsOwn) how.push("It's an engine, not a kill: it gives you an edge that a finisher then cashes in.");
    if (finisherPiece) how.push(`${finisherPiece} is both a finisher and a combo piece, so protect it.`);
    if (c.featured) how.push("One of Commander Spellbook's featured combos.");
    else if ((c.popularity ?? 0) >= 1000) how.push(`A well-known line: ${c.popularity!.toLocaleString()} decks on EDHREC run it.`);
    const setup = [
      c.manaNeeded ? `${c.manaNeeded} mana to assemble` : "",
      tutors.length ? `find missing pieces with ${list(tutors, "or")}` : "",
      shields.length ? `protect it with ${list(shields, "or")}` : "",
    ].filter(Boolean);
    winCons.push({
      kind: "combo",
      name: c.cards.join(" + "),
      how: how.join(" "),
      board: c.requires ? c.requires.replace(/\s+/g, " ").trim() : "All pieces on the battlefield (or in hand, for instants).",
      setup: setup.length ? `${setup.join("; ").replace(/^./, (m) => m.toUpperCase())}.` : undefined,
    });
  }

  // Finishers, grouped by how they win (two overruns are one plan, not two).
  const finishers = by((x) => x.role === "finisher");
  const byKind = new Map<FinisherKind | "other", DeckEntry[]>();
  for (const f of finishers) {
    const card = data.get(f.name.toLowerCase());
    const kind = card ? finisherKind(card, cardTags(card.name)) ?? "other" : "other";
    byKind.set(kind, [...(byKind.get(kind) ?? []), f]);
  }
  for (const [kind, group] of byKind) {
    const n = names(group, 3);
    if (kind === "other") {
      winCons.push({ kind: "finisher", name: list(n), how: `${n.length > 1 ? "Finishers" : "Finisher"}: cast once the board is set up; ${n.length > 1 ? "each ends" : "it ends"} the game in a turn or two.` });
      continue;
    }
    const spec = FINISH[kind];
    let how = spec.how;
    if (kind === "altwin") {
      const clause = oracle(group[0].name).split(/\n|(?<=\.)\s+(?=[A-Z])/).find((l) => /win the game|loses the game/i.test(l));
      if (clause) how = `${how} ${group[0].name}: “${clause.trim()}”`;
    }
    const inCombo = group.filter((g) => combos.some((c) => c.cards.includes(g.name))).map((g) => g.name);
    if (inCombo.length) how += ` ${list(inCombo)} also ${inCombo.length === 1 ? "appears" : "appear"} in a combo above.`;
    const setup = kind === "altwin" && tutors.length ? `Find it with ${list(tutors, "or")}.` : kind === "threat" && shields.length ? `Protect it with ${list(shields, "or")}.` : undefined;
    winCons.push({ kind: "finisher", name: list(n), how: `${FINISHER_LABEL[kind].replace(/^./, (m) => m.toUpperCase())}. ${how}`, board: spec.board(counts), setup });
  }

  // The commander as the win condition.
  const cmdKind = cmdCard ? finisherKind(cmdCard, cardTags(cmdCard.name)) : null;
  if (deck.options.themes.includes("voltron")) {
    const gear = names(by((c) => /Equipment|Aura/.test(c.typeLine)), 3);
    winCons.unshift({ kind: "commander", name: cmd, how: "Commander damage: 21 combat damage from your commander knocks a player out, whatever their life total.", board: `Suit ${cmd} up${gear.length ? ` with ${list(gear)}` : ""} and give it evasion; it only needs three or four connected hits.`, setup: shields.length ? `Keep ${list(shields, "or")} ready: the deck stalls if ${cmd} dies.` : undefined });
  } else if (cmdKind && cmdKind !== "threat") {
    winCons.unshift({ kind: "commander", name: cmd, how: `${FINISHER_LABEL[cmdKind].replace(/^./, (m) => m.toUpperCase())}. ${FINISH[cmdKind].how}`, board: FINISH[cmdKind].board(counts) });
  }

  // Nothing else: the biggest threats.
  if (winCons.length < 2) {
    const beaters = by((c) => c.role !== "finisher" && /Creature/.test(c.typeLine) && c.cmc >= 4);
    const n = names(beaters, 3);
    if (n.length) winCons.push({ kind: "threats", name: list(n), how: "Combat: the deck's biggest creatures close the game over a few turns of attacks.", board: FINISH.threat.board(counts) });
  }

  // ---- Mulligan: one rule of thumb, one line of what to look for.
  const cheapRamp = nonLand.filter((c) => c.role === "ramp" && c.cmc <= 2).sort((a, b) => a.cmc - b.cmc || strength(b) - strength(a));
  const cheapDraw = nonLand.filter((c) => c.role === "draw" && c.cmc <= 3).sort((a, b) => strength(b) - strength(a));
  const openers = [...names(cheapRamp, 3), ...names(cheapDraw, 1)];
  const mulligan = [
    `Keep ${lands >= 38 ? "3–5" : "3–4"} lands with something to cast by turn 3; send back 0–1 or 6+ landers.`,
    openers.length ? `Hands with ${list(openers, "or")} are the ones you want.` : "There's little cheap ramp, so keep hands on land drops and be happy with four lands.",
  ];

  // ---- Phases.
  const early = nonLand.filter((c) => c.cmc <= 2).sort((a, b) => strength(b) - strength(a));
  const mid = nonLand.filter((c) => c.cmc >= 3 && c.cmc <= 4 && c.role !== "wipe").sort((a, b) => strength(b) - strength(a));
  const late = nonLand.filter((c) => c.cmc >= 5 || c.role === "finisher").sort((a, b) => strength(b) - strength(a));
  const phases: Primer["phases"] = [
    { label: "Early game (turns 1–3)", cards: names(early, 3), tip: "Ramp and set up; don't overextend into a wipe." },
    { label: "Mid game (turns 4–6)", cards: names(mid, 3), tip: `Land ${cmd} and your engines; save removal for real threats.` },
    { label: "Late game", cards: names(late, 3), tip: "Cast finishers when opponents are tapped out." },
  ];

  // ---- Weak spots: the thin categories in one line, then at most one more warning.
  const thin: string[] = [];
  if (count("wipe") < 2) thin.push(`${count("wipe")} board wipe${count("wipe") === 1 ? "" : "s"}`);
  if (count("draw") < 8) thin.push(`${count("draw")} card draw`);
  if (count("removal") < 6) thin.push(`${count("removal")} spot removal`);
  const watchOut: string[] = [];
  if (thin.length) watchOut.push(`Light on ${list(thin)}: ${thin.length > 1 ? "long games and fast boards can get away from you" : count("wipe") < 2 ? "a fast board can get away from you" : count("draw") < 8 ? "you can run out of gas in long games" : "one scary permanent can be hard to answer"}.`);
  if (combos.length && (deck.options.bracket ?? 3) <= 3) watchOut.push(`Has ${combos.length} combo${combos.length === 1 ? "" : "s"}; tell your pod at bracket ${deck.options.bracket ?? 3}.`);
  else if (count("protection") < 2 && (deck.options.themes.includes("voltron") || wants.length)) watchOut.push(`Few ways to protect ${cmd}; expect it to eat removal.`);
  else if (count("counter") === 0 && cmdCard?.colorIdentity.includes("U")) watchOut.push("No counterspells despite blue, so nothing stops a winning spell on the stack.");

  const theme = tagLabel ?? (deck.options.tribe ? `${deck.options.tribe} tribal` : themeIds.map((t) => LABEL[t]).filter(Boolean).join(" / "));
  const summary = `${cmd}${theme ? ` ${theme}` : ""}: ${strategy ? strategy.split(/[,.;]/)[0].toLowerCase() : "a goodstuff build"}. Power ${deck.stats.power?.score ?? "?"}/10.`;

  return { summary, plan, keyCards, winCons: winCons.slice(0, 5), mulligan, phases, watchOut };
}
