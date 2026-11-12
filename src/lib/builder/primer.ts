import type { BuiltDeck, CardData, Combo, DeckEntry, Primer, ThemeId } from "../types";
import { THEMES } from "../types";
import { detectThemes } from "./commanders";

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

export function buildPrimer(deck: Pick<BuiltDeck, "cards" | "commanders" | "stats" | "options" | "combos">, commanderCards: CardData[], tagLabel?: string): Primer {
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

  // ---- Key cards: the engines that make the deck tick.
  const keyCards = [...nonLand]
    .filter((c) => c.role !== "ramp" || (c.edhrec?.synergy ?? 0) > 0.2)
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, 4)
    .map((c) => ({ name: c.name, why: c.reason }));

  // ---- Win conditions.
  const winCons: Primer["winCons"] = [];
  for (const c of combos.slice(0, 3)) winCons.push({ name: c.cards.join(" + "), how: `Combo: ${c.produces.slice(0, 2).join(", ").toLowerCase()}.` });
  for (const c of nonLand.filter((x) => x.role === "finisher").slice(0, 3)) winCons.push({ name: c.name, how: "Finisher: cast it once the board is set up and it ends the game in a turn or two." });
  if (winCons.length < 2) {
    const beaters = nonLand.filter((c) => /Creature/.test(c.typeLine) && c.cmc >= 4).sort((a, b) => strength(b) - strength(a));
    for (const c of beaters.slice(0, 2 - winCons.length)) winCons.push({ name: c.name, how: "Big threat: one of the main ways the deck closes games in combat." });
  }
  if (deck.options.themes.includes("voltron")) winCons.unshift({ name: cmd, how: "Commander damage: 21 from your commander knocks a player out." });

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

  return { summary, plan, keyCards, winCons: winCons.slice(0, 3), mulligan, phases, watchOut };
}
