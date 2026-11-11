import { readJson } from "@/lib/read-body";
import { withImages } from "@/lib/scryfall";
import { buildPool } from "@/lib/builder/heuristic";
import { buildPrimer } from "@/lib/builder/primer";
import { comboSuggestions, upgradeDeck, type UpgradeOptions } from "@/lib/builder/upgrade";
import { edhrecContextFor } from "@/lib/edhrec-context";
import { fetchCollection, fetchNamed, normalizeCard } from "@/lib/scryfall";
import { findCombos } from "@/lib/spellbook";
import type { BuildOptions, CardData, ReferenceDeck } from "@/lib/types";

export const maxDuration = 120;

interface UpgradeRequest {
  deck: ReferenceDeck;
  commanders?: string[]; // overrides deck.commanders when the list didn't mark them
  owned: { card: CardData; quantity: number; sets?: string[] }[];
  build: BuildOptions;
  upgrade: UpgradeOptions;
  /** Just explain the list (primer + combos), no swaps. Works without a collection. */
  explainOnly?: boolean;
}

/** Resolve deck card names to Scryfall data (75 per request). */
async function resolve(names: string[]): Promise<{ found: Map<string, CardData>; missing: string[] }> {
  const found = new Map<string, CardData>();
  const missing: string[] = [];
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75);
    const res = await fetchCollection(chunk.map((name) => ({ name: name.split(" // ")[0] })));
    for (const c of res.data) {
      const card = normalizeCard(c);
      found.set(card.name.toLowerCase(), card);
      found.set(card.name.split(" // ")[0].toLowerCase(), card);
    }
    for (const nf of res.not_found) {
      if ("name" in nf) {
        const c = await fetchNamed(nf.name);
        if (c) {
          const card = normalizeCard(c);
          found.set(nf.name.toLowerCase(), card);
          found.set(card.name.toLowerCase(), card);
        } else missing.push(nf.name);
      }
    }
  }
  return { found, missing };
}

export async function POST(req: Request) {
  let body: UpgradeRequest;
  try {
    body = await readJson(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.deck?.cards?.length) return Response.json({ error: "That deck has no cards." }, { status: 400 });
  if (!body.owned?.length && !body.explainOnly) return Response.json({ error: "Import your collection first — upgrades come from your bulk." }, { status: 400 });
  if (body.explainOnly) body.upgrade = { ...body.upgrade, maxSwaps: 0 };

  const main = body.deck.cards.filter((c) => c.board === "main" || c.board === "commander");
  const names = [...new Set(main.map((c) => c.name))];
  let resolved;
  try {
    resolved = await resolve(names);
  } catch (e) {
    return Response.json({ error: `Scryfall lookup failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
  const get = (n: string) => resolved.found.get(n.toLowerCase()) ?? resolved.found.get(n.split(" // ")[0].toLowerCase());

  // Commanders: explicit > marked in the list > ask the client.
  const cmdNames = body.commanders?.length ? body.commanders : body.deck.commanders;
  const commanders = cmdNames.map(get).filter((c): c is CardData => !!c);
  if (body.build.format === "commander" && !commanders.length) {
    const legends = main.map((c) => get(c.name)).filter((c): c is CardData => !!c && (/Legendary Creature/.test(c.typeLine) || /can be your commander/i.test(c.oracleText)));
    return Response.json({ needCommander: [...new Set(legends.map((c) => c.name))] });
  }

  const cmdSet = new Set(commanders.map((c) => c.name.toLowerCase()));
  const deck = main
    .filter((c) => c.board === "main")
    .map((c) => ({ card: get(c.name), quantity: c.quantity }))
    .filter((d): d is { card: CardData; quantity: number } => !!d.card && !cmdSet.has(d.card.name.toLowerCase()));

  const build: BuildOptions = { ...body.build, commander: commanders[0]?.name, partner: commanders[1]?.name };
  const ed = await edhrecContextFor(build, { ci: [...new Set(commanders.flatMap((c) => c.colorIdentity))], commanderReleased: commanders[0]?.releasedAt });
  const pool = buildPool(body.owned ?? []);

  const result = upgradeDeck({
    name: body.deck.name,
    source: body.deck.url || body.deck.source,
    deck,
    commanders,
    pool,
    build,
    upgrade: body.upgrade,
    ed,
    unresolved: resolved.missing,
  });

  // Combos: present in the upgraded list, and completable from the collection.
  if (commanders.length) {
    const deckNames = new Set(result.cards.map((c) => c.name.toLowerCase()));
    const inList = await findCombos(commanders.map((c) => c.name), result.cards.filter((c) => c.role !== "land").map((c) => c.name));
    result.combos = inList.included.slice(0, 12);
    const benchNames = result.alternatives.map((a) => a.name);
    const withBulk = await findCombos(commanders.map((c) => c.name), [...result.cards.filter((c) => c.role !== "land").map((c) => c.name), ...benchNames]);
    if (result.upgrade) result.upgrade.comboSuggestions = comboSuggestions(withBulk.included, deckNames, build.bracket ?? 3);
  }

  if (!ed.cards.length && build.useEdhrec) result.warnings.push("EDHREC had nothing for this commander (or was unreachable), so swaps are based on card quality and theme only.");
  result.primer = buildPrimer(result, commanders, ed.tagLabel);
  if (body.explainOnly) {
    result.upgrade = undefined;
    result.alternatives = [];
    result.name = body.deck.name;
    result.notes = result.notes.filter((n) => !n.startsWith("Compared") && !n.startsWith("Stopped"));
  }
  return Response.json({ deck: withImages(result) });
}
