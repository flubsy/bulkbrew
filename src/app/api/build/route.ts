import { readJson } from "@/lib/read-body";
import { withImages } from "@/lib/scryfall";
import { aiAvailable, refineWithAI } from "@/lib/builder/ai";
import { buildHeuristic, buildPool, scorePool } from "@/lib/builder/heuristic";
import { ratePower } from "@/lib/builder/power";
import { buildPrimer } from "@/lib/builder/primer";
import { edhrecContextFor } from "@/lib/edhrec-context";
import { sampleDecks } from "@/lib/similar-decks";
import { applyBracketEstimate, findCombos } from "@/lib/spellbook";
import type { BuildOptions, CardData, ReferenceDeck } from "@/lib/types";

export const maxDuration = 300;

interface BuildRequest {
  options: BuildOptions;
  owned: { card: CardData; quantity: number; sets?: string[] }[];
  refs: ReferenceDeck[];
}

type Step = (pct: number, label: string) => void;

/**
 * POST BuildRequest → { deck: BuiltDeck, aiAvailable: boolean }
 * With the header `X-Progress: 1` the answer streams instead, one JSON object per line:
 * { type: "progress", pct, label } while it works, then { type: "done", deck, aiAvailable }
 * (or { type: "error", error }). The Build page uses that for its progress bar.
 */
export async function POST(req: Request) {
  let body: BuildRequest;
  try {
    body = await readJson(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.options || !Array.isArray(body.owned)) return Response.json({ error: "Missing options or collection." }, { status: 400 });
  if (!body.owned.length) return Response.json({ error: "Your collection is empty. Import it first." }, { status: 400 });

  if (req.headers.get("x-progress") !== "1") return Response.json(await buildDeck(body, () => {}));

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await buildDeck(body, (pct, label) => send({ type: "progress", pct, label }));
        send({ type: "done", ...result });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Build failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

async function buildDeck(body: BuildRequest, step: Step) {
  step(3, "Reading your collection");
  const pool = buildPool(body.owned);
  const refs = body.refs ?? [];
  const opts = body.options;

  const cmdCards = [opts.commander, opts.partner].filter(Boolean).map((n) => pool.find((p) => p.card.name.toLowerCase() === n!.toLowerCase())?.card).filter((c) => !!c);
  const ci = cmdCards.length ? [...new Set(cmdCards.flatMap((c) => c!.colorIdentity))] : opts.colors;
  step(10, "Pulling EDHREC data and real decklists for your commander");
  // EDHREC data and real decklists for "decks like yours", fetched side by side.
  const [edBase, samples] = await Promise.all([
    edhrecContextFor(opts, { ci, commanderReleased: cmdCards[0]?.releasedAt }),
    opts.commander && opts.useEdhrec && opts.format === "commander" ? sampleDecks(opts.commander, opts.partner) : Promise.resolve(null),
  ]);
  // A copy: edhrecContextFor can return a shared empty object, which must never be modified.
  const ed = samples?.decks.length ? { ...edBase, sampleDecks: samples.decks, sampleSources: samples.sources } : edBase;
  step(35, "Scoring your collection and filling the deck");
  let deck = buildHeuristic(pool, opts, refs, ed);
  if (opts.useEdhrec && !ed.cards.length) deck.warnings.push("EDHREC returned nothing for this commander/theme (or was unreachable). Built without it.");

  step(55, "Looking for combos you can complete from your collection");
  // Extra ways to win: combos the list is one or two owned cards away from (pieces on the bench).
  // Brackets 1–2 allow no combos; bracket 3 no early two-card ones (see the filter below); 4–5 anything.
  const bracket = opts.bracket ?? 3;
  if (deck.commanders.length && bracket >= 3 && opts.format === "commander") {
    try {
      const lower = (s: string) => s.toLowerCase();
      const inDeck = new Set([...deck.cards, ...deck.commanders].map((c) => lower(c.name)));
      // Bench = your best eligible non-land cards (up to 300), not just the 60 shown as alternatives,
      // so a combo piece that scored low on its own can still be found.
      const { candidates } = scorePool(pool, opts, refs, cmdCards as CardData[], ed);
      const benchCards = candidates.filter((c) => c.role !== "land" && c.score > -50 && !inDeck.has(lower(c.card.name))).sort((a, b) => b.score - a.score).slice(0, 300);
      const bench = new Set(benchCards.map((c) => lower(c.card.name)));
      const found = await findCombos(deck.commanders.map((c) => c.name), [...deck.cards.filter((c) => c.role !== "land").map((c) => c.name), ...benchCards.map((c) => c.card.name)]);
      // Prefer a coherent package: cheap pieces, the commander as a piece, pieces shared with
      // combos already in the list, and few new cards. Slow, scattered lines are skipped.
      const cmcOf = new Map([...deck.cards.map((c) => [lower(c.name), c.cmc] as const), ...benchCards.map((c) => [lower(c.card.name), c.card.cmc] as const), ...deck.commanders.map((c) => [lower(c.name), c.cmc] as const)]);
      const cmdNames = new Set(deck.commanders.map((c) => lower(c.name)));
      const present = found.included.filter((c) => c.cards.every((n) => inDeck.has(lower(n))));
      // Same test the power model uses (comboCoherence): tutors + a quarter of the draw.
      const roleN = (r: string) => deck.cards.filter((c) => c.role === r).reduce((n, c) => n + c.quantity, 0);
      const support = roleN("tutor") + Math.floor(roleN("draw") / 4);
      const presentPieces = new Set(present.flatMap((c) => c.cards.map(lower)));
      const options = found.included
        .map((c) => {
          const need = c.cards.filter((n) => !inDeck.has(lower(n)));
          const cost = c.cards.reduce((s, n) => s + (cmdNames.has(lower(n)) ? 0 : cmcOf.get(lower(n)) ?? 3), 0);
          const usesCommander = c.cards.some((n) => cmdNames.has(lower(n)));
          const sharesPiece = c.cards.some((n) => presentPieces.has(lower(n)) && !cmdNames.has(lower(n)));
          // Popular lines (EDHREC decks running them, per Spellbook) and Spellbook's featured picks
          // are proven and well documented, so they're preferred over obscure ones.
          const score = (usesCommander ? 4 : 0) + (sharesPiece ? 3 : 0) - need.length * 2 - Math.max(0, cost - 5) + 1.5 * Math.log10((c.popularity ?? 0) + 1) + (c.featured ? 2 : 0);
          return { c, need, cost, score, usesCommander, sharesPiece };
        })
        // Bracket 3: three-card combos, or two-card ones that can't come together early (6+ mana of
        // pieces) and that Spellbook doesn't rate "Ruthless". Brackets 4–5: anything.
        .filter((x) => bracket >= 4 || x.c.cards.length >= 3 || (x.cost >= 6 && x.c.bracketTag !== "Ruthless"))
        .filter((x) => x.need.length > 0 && x.need.length <= 2 && x.need.every((n) => bench.has(lower(n))) && x.cost <= 7 && (x.usesCommander || x.sharesPiece || support >= 4))
        .sort((a, b) => b.score - a.score);
      const picked: typeof options = [];
      for (const o of options) {
        if (picked.length >= (bracket >= 4 ? 2 : 1)) break;
        // A second line must share a piece with the first, or it's a separate package to assemble.
        if (picked.length && !o.c.cards.some((n) => picked[0].c.cards.map(lower).includes(lower(n)))) continue;
        picked.push(o);
      }
      const need = [...new Set(picked.flatMap((p) => p.need))];
      if (need.length) {
        const rebuilt = buildHeuristic(pool, { ...opts, includeCards: [...opts.includeCards, ...need] }, refs, ed);
        for (const p of picked) {
          const why = `Combo piece: with ${p.c.cards.filter((n) => !p.need.includes(n)).join(" + ")} → ${p.c.produces.slice(0, 2).join(", ").toLowerCase()}`;
          for (const e of rebuilt.cards) if (p.need.includes(e.name)) e.reason = why;
        }
        const after = new Set(rebuilt.cards.map((c) => lower(c.name)));
        const cut = deck.cards.filter((c) => c.role !== "land" && !after.has(lower(c.name))).map((c) => c.name);
        rebuilt.notes.push(`Combos: added ${need.join(", ")} from your collection to complete ${picked.map((p) => p.c.cards.join(" + ")).join("; ")}, as an extra way to win${cut.length ? `. Made room by cutting ${cut.slice(0, 6).join(", ")}${cut.length > 6 ? "…" : ""}` : ""}.`);
        rebuilt.warnings.push(...deck.warnings.filter((w) => !rebuilt.warnings.includes(w)));
        deck = rebuilt;
      }
    } catch { /* Spellbook unreachable: keep the first build */ }
  }

  if (opts.useAI) step(70, "Asking Claude to refine the list");
  if (opts.useAI) {
    if (!aiAvailable()) {
      deck.warnings.push("AI pass skipped: AI is off on this server (no ANTHROPIC_API_KEY, or DECKBIT_DISABLE_AI is set).");
    } else {
      try {
        const commanders = deck.commanders.map((c) => pool.find((p) => p.card.name === c.name)!.card);
        const { candidates } = scorePool(pool, opts, refs, commanders, ed);
        deck = await refineWithAI(deck, candidates, opts, refs);
      } catch (e) {
        deck.warnings.push(`AI pass failed: ${e instanceof Error ? e.message : "unknown error"}. Showing the rules-engine build.`);
      }
    }
  }

  step(80, "Checking combos and the bracket with Commander Spellbook");
  // Combos actually in the finished list (Commander Spellbook).
  if (deck.commanders.length) {
    const combos = await findCombos(deck.commanders.map((c) => c.name), deck.cards.filter((c) => c.role !== "land").map((c) => c.name));
    deck.combos = combos.included.slice(0, 12);

    if (bracket <= 2 && combos.included.length) deck.warnings.push(`This list contains ${combos.included.length} combo(s), which bracket ${bracket} doesn't allow. See the combos panel and cut a piece.`);
  }

  await applyBracketEstimate(deck);
  deck.stats.power = ratePower(deck, { combos: deck.combos });
  step(95, "Writing the primer");
  deck.primer = buildPrimer(deck, cmdCards.filter((c): c is NonNullable<typeof c> => !!c), ed.tagLabel, pool.map((p) => p.card));
  step(100, "Done");
  return { deck: withImages(deck), aiAvailable: aiAvailable() };
}
