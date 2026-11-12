"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import type { UpgradeOptions } from "@/lib/builder/upgrade";
import { db } from "@/lib/db";
import { packCollection, postJson } from "@/lib/payload";
import { readReserveMode, reservedCounts, withoutReserved } from "@/lib/reserve";
import { isBasic, manaPips } from "@/lib/scryfall";
import { FORMATS, type BuiltDeck, type CardData, type Color, type DeckEntry, type ReferenceDeck } from "@/lib/types";
import { useCurrency } from "./currency-provider";
import { ManaCost } from "./mana";
import { GLYPH_PLUS, Sprite } from "./sprites";
import { Button, Input, Notice, Panel } from "./ui";
import { UpgradeSummaryView } from "./upgrade-summary";

/* ------------------------------------------------------------------------------------------ */
/* Hand edits: a draft of the list that is recomputed (stats, combos, power, primer) on save.  */
/* ------------------------------------------------------------------------------------------ */

export interface DeckDraft {
  cards: DeckEntry[];
  alternatives: DeckEntry[];
  /** Scryfall data for cards added from the collection, so the server can give them a role. */
  added: CardData[];
}

export function useDeckDraft(deck: BuiltDeck, onSaved: (d: BuiltDeck) => void, persist: boolean) {
  const [draft, setDraft] = useState<DeckDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => { setError(null); setDraft({ cards: deck.cards, alternatives: deck.alternatives ?? [], added: [] }); };
  const discard = () => { setDraft(null); setError(null); };

  function remove(e: DeckEntry) {
    setDraft((d) => {
      if (!d) return d;
      if (isBasic(e.name) && e.quantity > 1) return { ...d, cards: d.cards.map((c) => (c.name === e.name ? { ...c, quantity: c.quantity - 1 } : c)) };
      return {
        ...d,
        cards: d.cards.filter((c) => c.name !== e.name),
        alternatives: isBasic(e.name) || d.alternatives.some((a) => a.name === e.name) ? d.alternatives : [{ ...e, quantity: 1 }, ...d.alternatives],
      };
    });
  }

  function addEntry(e: DeckEntry, card?: CardData) {
    setDraft((d) => {
      if (!d) return d;
      const have = d.cards.find((c) => c.name === e.name);
      if (have && !isBasic(e.name)) return d;
      const cards = have ? d.cards.map((c) => (c.name === e.name ? { ...c, quantity: c.quantity + 1 } : c)) : [...d.cards, { ...e, quantity: 1 }];
      return {
        cards,
        alternatives: d.alternatives.filter((a) => a.name !== e.name),
        added: card && !d.added.some((a) => a.name === card.name) ? [...d.added, card] : d.added,
      };
    });
  }

  const addOwned = (c: CardData) => addEntry(entryFromCard(c), c);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const json = await postJson<{ deck?: BuiltDeck; error?: string }>("/api/deck-edit", { deck: { ...deck, cards: draft.cards, alternatives: draft.alternatives }, cards: draft.added });
      if (!json.deck) throw new Error(json.error ?? "Couldn't recompute the deck");
      const updated: BuiltDeck = { ...json.deck, id: deck.id, createdAt: deck.createdAt, editedAt: Date.now() };
      if (persist) await db.builds.put(updated);
      onSaved(updated);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the changes");
    } finally {
      setSaving(false);
    }
  }

  const changes = draft ? diff(deck.cards, draft.cards) : { added: [], removed: [] };
  return { draft, start, discard, remove, addEntry, addOwned, save, saving, error, changes };
}

function entryFromCard(c: CardData): DeckEntry {
  return {
    name: c.name,
    quantity: 1,
    role: /Land/.test(c.typeLine.split("//")[0]) ? "land" : "utility",
    cmc: c.cmc,
    typeLine: c.typeLine,
    manaCost: c.manaCost,
    priceUsd: c.priceUsd,
    score: 0,
    reason: "Added by you from your collection",
    scryfallId: c.scryfallId,
    imageSmall: c.imageSmall,
    imageNormal: c.imageNormal,
    gameChanger: c.gameChanger || undefined,
  };
}

function diff(before: DeckEntry[], after: DeckEntry[]) {
  const q = (l: DeckEntry[]) => new Map(l.map((c) => [c.name, c.quantity]));
  const a = q(before), b = q(after);
  const added: string[] = [], removed: string[] = [];
  for (const [n, k] of b) for (let i = a.get(n) ?? 0; i < k; i++) added.push(n);
  for (const [n, k] of a) for (let i = b.get(n) ?? 0; i < k; i++) removed.push(n);
  return { added, removed };
}

/** The deck's colour identity: the commanders' (from the collection when owned), else the colours the list uses. */
function deckIdentity(deck: BuiltDeck, owned: { card?: CardData }[]): Set<Color> {
  const ci = new Set<Color>();
  let known = false;
  for (const cmd of deck.commanders) {
    const card = owned.find((o) => o.card?.name === cmd.name)?.card;
    if (card) { known = true; card.colorIdentity.forEach((c) => ci.add(c)); }
  }
  if (known) return ci;
  for (const e of [...deck.commanders, ...deck.cards]) {
    const p = manaPips(e.manaCost);
    (Object.keys(p) as Color[]).forEach((k) => p[k] > 0 && ci.add(k));
  }
  return ci;
}

/** Search your own collection for cards that fit this deck: colour identity, legality, not already in. */
export function OwnedSearch({ deck, inDeck, onAdd }: { deck: BuiltDeck; inDeck: Set<string>; onAdd: (c: CardData) => void }) {
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const [q, setQ] = useState("");
  const { fmt } = useCurrency();
  const format = FORMATS.find((f) => f.id === deck.options.format);

  const fits = useMemo(() => {
    if (!owned) return [];
    const ci = deckIdentity(deck, owned);
    const byName = new Map<string, CardData>();
    for (const o of owned) {
      const c = o.card;
      if (!c || byName.has(c.name)) continue;
      if (!c.colorIdentity.every((x) => ci.has(x))) continue;
      if (format && c.legalities[format.scryfall] && !["legal", "restricted"].includes(c.legalities[format.scryfall])) continue;
      byName.set(c.name, c);
    }
    return [...byName.values()];
  }, [owned, deck, format]);

  const needle = q.trim().toLowerCase();
  const hits = needle.length < 2 ? [] : fits
    .filter((c) => (!inDeck.has(c.name) || isBasic(c.name)) && (c.name.toLowerCase().includes(needle) || c.typeLine.toLowerCase().includes(needle) || c.oracleText.toLowerCase().includes(needle)))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)) || (a.edhrecRank ?? 1e9) - (b.edhrecRank ?? 1e9))
    .slice(0, 12);

  return (
    <div>
      <label className="px-label" htmlFor="owned-search">Add from your collection</label>
      <Input id="owned-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card name, type or rules text…" autoComplete="off" />
      <p className="mt-1 text-[14px] text-muted">Only cards you own that fit the commander&apos;s colours and are legal here.</p>
      {needle.length >= 2 && (
        <ul className="mt-2 grid gap-[2px] xl:grid-cols-2">
          {hits.length === 0 && <li className="px-2 py-1 text-[16px] text-muted">Nothing in your collection matches.</li>}
          {hits.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-2 px-2 py-1 text-[18px] hover:bg-navy-600">
              <span className="truncate">{c.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <ManaCost cost={c.manaCost} size={16} />
                <span className="w-14 text-right text-[14px] text-muted">{fmt(c.priceUsd)}</span>
                <button type="button" onClick={() => onAdd(c)} aria-label={`Add ${c.name}`} title={`Add ${c.name}`} className="inline-flex h-7 w-7 items-center justify-center text-cream-dim hover:bg-navy-900 hover:text-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
                  <Sprite grid={GLYPH_PLUS} scale={2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Re-evaluate: run the upgrade engine on a saved deck against today's collection.             */
/* ------------------------------------------------------------------------------------------ */

export function useReEvaluate(deck: BuiltDeck) {
  const [result, setResult] = useState<BuiltDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [owned, builds] = await Promise.all([db.owned.toArray(), db.builds.toArray()]);
      if (!owned.length) throw new Error("Import your collection first: re-evaluating looks for better cards in it.");
      const pool = withoutReserved(owned, reservedCounts(builds, readReserveMode(), [deck.id]));
      const ref: ReferenceDeck = {
        id: `build:${deck.id}`,
        source: "text",
        url: "",
        name: deck.name || deck.commanders.map((c) => c.name).join(" / ") || "Deck",
        commanders: deck.commanders.map((c) => c.name),
        cards: [
          ...deck.commanders.map((c) => ({ name: c.name, quantity: 1, board: "commander" as const })),
          ...deck.cards.map((c) => ({ name: c.name, quantity: c.quantity, board: "main" as const })),
        ],
        fetchedAt: Date.now(),
      };
      const upgrade: UpgradeOptions = { maxSwaps: 10, minGain: 3, protect: [], allowLandSwaps: false };
      const json = await postJson<{ deck?: BuiltDeck; error?: string }>("/api/upgrade", {
        deck: ref,
        commanders: ref.commanders,
        owned: packCollection(pool, deck.options.format),
        build: { ...deck.options, commander: deck.commanders[0]?.name, partner: deck.commanders[1]?.name, useAI: false },
        upgrade,
      });
      if (!json.deck) throw new Error(json.error ?? "Re-evaluate failed");
      setResult(json.deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-evaluate failed");
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, result, dismiss: () => { setResult(null); setError(null); } };
}

export function ReEvaluatePanel({ deck, result, onApply, onDismiss }: { deck: BuiltDeck; result: BuiltDeck; onApply: (d: BuiltDeck) => void; onDismiss: () => void }) {
  const swaps = result.upgrade?.swaps.length ?? 0;
  if (!swaps) {
    return (
      <Notice tone="ok">
        Nothing in your collection beats what&apos;s in this deck right now.{" "}
        <Button size="sm" variant="ghost" onClick={onDismiss}>OK</Button>
      </Notice>
    );
  }
  const apply = () => onApply({
    ...result,
    id: deck.id,
    createdAt: deck.createdAt,
    name: deck.name,
    shareId: deck.shareId,
    inUse: deck.inUse,
    editedAt: Date.now(),
  });
  return (
    <Panel tone="gold" title={`Re-evaluated: ${swaps} better ${swaps === 1 ? "card" : "cards"} in your collection`}>
      <p className="text-[17px] text-cream-dim">The upgrade engine scored this list against everything you own today. Nothing changes until you apply it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={apply}>Apply {swaps} {swaps === 1 ? "swap" : "swaps"}</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </div>
      <div className="mt-4 grid gap-4">
        <UpgradeSummaryView deck={result} />
      </div>
    </Panel>
  );
}
