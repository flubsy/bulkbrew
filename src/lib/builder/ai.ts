import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BRACKETS, THEMES, type BuildOptions, type BuiltDeck, type DeckEntry, type ReferenceDeck } from "../types";
import { formatMeta, type Candidate, computeStats, sortDeck } from "./heuristic";
import { isBasic } from "../scryfall";
import { ratePower } from "./power";

/**
 * AI refinement pass. The heuristic engine produces a legal, owned-only deck plus a ranked
 * candidate pool; Claude is asked to re-select from that pool only. Every swap it proposes is
 * validated against the pool (ownership, quantity, bracket flags) before it is applied, so the
 * model can never add a card the user doesn't own.
 */

const MODEL = "claude-opus-5-5";

const AiResult = z.object({
  summary: z.string(),
  swaps: z
    .array(
      z.object({
        out: z.string(),
        in: z.string(),
        why: z.string(),
      }),
    )
    .max(40),
  role_fixes: z.array(z.object({ card: z.string(), role: z.string() })).max(60).optional(),
});

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "swaps"],
  properties: {
    summary: { type: "string", description: "3-6 sentences: the game plan, what the deck does well, what it lacks." },
    swaps: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["out", "in", "why"],
        properties: { out: { type: "string" }, in: { type: "string" }, why: { type: "string" } },
      },
    },
    role_fixes: {
      type: "array",
      maxItems: 60,
      items: { type: "object", additionalProperties: false, required: ["card", "role"], properties: { card: { type: "string" }, role: { type: "string" } } },
    },
  },
};

/** AI is opt-in per server: needs a key, and DECKBIT_DISABLE_AI=1 turns it off even with one (e.g. when friends use it). */
export function aiAvailable(): boolean {
  if (process.env.DECKBIT_DISABLE_AI === "1" || process.env.DECKBIT_DISABLE_AI === "true") return false;
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function refineWithAI(deck: BuiltDeck, candidates: Candidate[], opts: BuildOptions, refs: ReferenceDeck[]): Promise<BuiltDeck> {
  const client = new Anthropic();
  const meta = formatMeta(opts.format);
  const inDeck = new Set(deck.cards.map((c) => c.name));
  const byName = new Map(candidates.map((c) => [c.card.name.toLowerCase(), c] as const));

  // Bench: best candidates not already in the deck, excluding anything bracket-banned.
  const bench = candidates
    .filter((c) => !inDeck.has(c.card.name) && c.score > -50 && !isBasic(c.card.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 220);

  const line = (c: Candidate) =>
    `${c.card.name} | ${c.card.manaCost || "-"} | ${c.card.typeLine} | ${c.role} | $${c.priceUsd?.toFixed(2) ?? "?"} | own ${c.owned}${c.flagged.length ? ` | ${c.flagged.join(",")}` : ""}\n  ${oneLine(c.card.oracleText, 220)}`;

  const deckText = deck.cards.map((e) => `${e.quantity} ${e.name} [${e.role}]`).join("\n");
  const benchText = bench.map(line).join("\n");
  const themes = opts.themes.map((t) => THEMES.find((x) => x.id === t)?.label ?? t).join(", ") || "none";
  const bracket = opts.format === "commander" ? BRACKETS.find((b) => b.id === (opts.bracket ?? 3)) : undefined;
  const refText = refs.length ? refs.map((r) => `- ${r.name} (${r.source}${r.commanders.length ? `, ${r.commanders.join(" / ")}` : ""})`).join("\n") : "none";

  const system = `You are an expert Magic: The Gathering deck builder. You refine decks built ONLY from cards the user owns.
Hard rules:
- You may only swap in cards that appear in the BENCH list. Never name a card that is not in BENCH.
- Every swap removes exactly one card from the DECK and adds exactly one from BENCH (quantity 1 for singleton formats).
- Keep land count within ±1 of the current count unless the curve clearly demands otherwise.
- Respect the format, colour identity, and bracket. Cards flagged "game changer" may only be swapped in if the bracket allows it (bracket 3: max 3 total; bracket 1-2: none; bracket 4-5: fine).
- Prefer swaps that improve synergy with the commander/theme, fix the mana curve, add missing interaction, or cut dead cards. Do not make cosmetic swaps.
- Keep it to the swaps that matter (usually 5-25).
- Return the result as JSON matching the schema.`;

  const user = `FORMAT: ${meta.label} (${meta.size} cards${meta.singleton ? ", singleton" : ""})
COMMANDER: ${deck.commanders.map((c) => c.name).join(" / ") || "none"}
THEMES: ${themes}${opts.tribe ? ` (tribe: ${opts.tribe})` : ""}
BRACKET: ${bracket ? `${bracket.label} — ${bracket.blurb}` : "n/a"}
BUDGET: ${opts.budget ? `$${opts.budget} total` : "none"}${opts.maxCardPrice ? `, max $${opts.maxCardPrice}/card` : ""}
REFERENCE DECKS USED FOR SCORING:
${refText}

CURRENT DECK (${deck.stats.total} cards, avg cmc ${deck.stats.avgCmc}, lands ${deck.stats.lands}):
${deckText}

BENCH (owned, eligible, not in deck — name | cost | type | role | price | owned | flags, then oracle text):
${benchText}

Improve this deck with swaps from BENCH only. Then write the summary.`;

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: RESULT_SCHEMA } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    return { ...deck, warnings: [...deck.warnings, "The AI pass declined this request; showing the heuristic build."] };
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = AiResult.safeParse(safeJson(text));
  if (!parsed.success) {
    return { ...deck, warnings: [...deck.warnings, "The AI pass returned something unreadable; showing the heuristic build."] };
  }

  // Apply swaps with validation.
  const cards: DeckEntry[] = deck.cards.map((c) => ({ ...c }));
  const applied: { out: string; in: string; why: string }[] = [];
  const skipped: string[] = [];
  const gcCap = opts.format !== "commander" ? 99 : (opts.bracket ?? 3) <= 2 ? 0 : (opts.bracket ?? 3) === 3 ? 3 : 99;
  let gcUsed = cards.filter((c) => c.gameChanger).length;
  let spend = deck.stats.priceUsd;

  for (const s of parsed.data.swaps) {
    const outIdx = cards.findIndex((c) => c.name.toLowerCase() === s.out.toLowerCase());
    const cand = byName.get(s.in.toLowerCase());
    if (outIdx < 0 || !cand) { skipped.push(`${s.out} → ${s.in} (not in deck/bench)`); continue; }
    if (cards.some((c) => c.name === cand.card.name)) { skipped.push(`${s.in} already in deck`); continue; }
    if (cand.flagged.includes("game changer") && gcUsed >= gcCap) { skipped.push(`${s.in} (game changer cap)`); continue; }
    if (cand.score <= -50) { skipped.push(`${s.in} (not allowed at this bracket)`); continue; }
    const outCard = cards[outIdx];
    const delta = (cand.priceUsd ?? 0) - (outCard.priceUsd ?? 0) * outCard.quantity;
    if (opts.budget && spend + delta > opts.budget) { skipped.push(`${s.in} (budget)`); continue; }
    const qty = meta.singleton ? 1 : Math.min(outCard.quantity, cand.owned);
    if (qty < outCard.quantity) {
      // Partial swap: keep the remaining copies of the outgoing card.
      cards[outIdx] = { ...outCard, quantity: outCard.quantity - qty };
    } else {
      cards.splice(outIdx, 1);
    }
    if (cand.flagged.includes("game changer")) gcUsed++;
    spend += delta;
    cards.push({
      name: cand.card.name,
      quantity: qty,
      role: cand.role,
      cmc: cand.card.cmc,
      typeLine: cand.card.typeLine,
      manaCost: cand.card.manaCost,
      priceUsd: cand.priceUsd,
      score: Math.round(cand.score * 10) / 10,
      reason: `AI: ${s.why}`,
      scryfallId: cand.card.scryfallId,
      imageSmall: cand.card.imageSmall,
      imageNormal: cand.card.imageNormal,
      gameChanger: cand.flagged.includes("game changer") || undefined,
    });
    applied.push(s);
  }

  for (const f of parsed.data.role_fixes ?? []) {
    const c = cards.find((x) => x.name.toLowerCase() === f.card.toLowerCase());
    const role = f.role as DeckEntry["role"];
    if (c && ["ramp", "draw", "removal", "wipe", "counter", "tutor", "protection", "recursion", "finisher", "synergy", "creature", "utility", "land"].includes(role)) c.role = role;
  }

  const warnings = [...deck.warnings];
  if (skipped.length) warnings.push(`AI suggested ${skipped.length} swap(s) that were rejected by validation: ${skipped.slice(0, 6).join("; ")}${skipped.length > 6 ? "…" : ""}`);

  const inNow = new Set(cards.map((c) => c.name));
  const swappedOut = applied.map((s) => deck.cards.find((c) => c.name.toLowerCase() === s.out.toLowerCase())).filter((c): c is DeckEntry => !!c && !inNow.has(c.name));
  const alternatives = [...swappedOut.map((c) => ({ ...c, reason: `AI cut: ${applied.find((s) => s.out.toLowerCase() === c.name.toLowerCase())?.why ?? ""}` })), ...deck.alternatives.filter((a) => !inNow.has(a.name))].slice(0, 60);
  const stats = computeStats(cards, deck.commanders, opts.bracket ?? 3, gcUsed);
  stats.power = ratePower({ cards, commanders: deck.commanders, stats, options: opts }, new Map(candidates.map((c) => [c.card.name, c.card.edhrecRank] as const)));

  return {
    ...deck,
    cards: sortDeck(cards),
    stats,
    alternatives,
    aiSummary: parsed.data.summary,
    aiSwaps: applied,
    warnings,
    engine: "ai",
  };
}

function oneLine(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function safeJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}
