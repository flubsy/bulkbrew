"use client";

import { useCallback, useState } from "react";
import { ownedId, priceMissing } from "@/lib/collection";
import { db } from "@/lib/db";
import { keyOf, type Identifier } from "@/lib/scryfall";
import type { CardData, CollectionRow, OwnedCard } from "@/lib/types";

/**
 * Collection import, shared by the Collection page and the home page's cauldron:
 * read a CSV/TSV/XLSX file or pasted list, match every row to Scryfall (75 per request, two
 * requests in flight, retrying set+number misses by name), merge the results into the local
 * collection, then price unpriced printings in one pass at the end.
 */

export type ImportPhase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "enriching"; done: number; total: number }
  | { kind: "done"; added: number; missing: string[] }
  | { kind: "error"; message: string };

function toIdentifier(r: CollectionRow): Identifier {
  if (r.scryfallId) return { id: r.scryfallId };
  if (r.setCode && r.collectorNumber) return { set: r.setCode, collector_number: r.collectorNumber };
  if (r.setCode) return { name: r.name, set: r.setCode };
  return { name: r.name };
}

type RowKey = (r: CollectionRow) => string;
function toOwned(row: CollectionRow, card: CardData | undefined, now: number, rowKey: RowKey, err?: string): OwnedCard {
  return { ...row, id: card ? ownedId(card.scryfallId, row.foil) : rowKey(row), card, enrichError: err, importedAt: now };
}

async function lookup(identifiers: Identifier[]): Promise<Record<string, CardData>> {
  // prices: false — unpriced printings are priced once after the whole import (priceMissing).
  const res = await fetch("/api/scryfall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifiers, prices: false }) });
  const text = await res.text();
  let json: { cards?: Record<string, CardData>; error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`server error ${res.status}`);
  }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.cards ?? {};
}

export async function readImportFile(file: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
  }
  return file.text();
}

export function useCollectionImport() {
  const [phase, setPhase] = useState<ImportPhase>({ kind: "idle" });
  const [detected, setDetected] = useState("");

  const enrichAndStore = useCallback(async (rows: CollectionRow[], rowKey: RowKey) => {
    const total = rows.length;
    setPhase({ kind: "enriching", done: 0, total });
    const missing: string[] = [];
    const now = Date.now();
    const CHUNK = 75;
    const chunks: CollectionRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
    let done = 0;
    let failed: string | null = null;

    /** Match one chunk (and its by-name retries), then merge it into the collection in one transaction. */
    const runChunk = async (chunk: CollectionRow[]) => {
      const identifiers = chunk.map(toIdentifier);
      const cards = await lookup(identifiers);
      const retry: { row: CollectionRow; ident: Identifier }[] = [];
      const entries: OwnedCard[] = [];
      chunk.forEach((row, j) => {
        const card = cards[keyOf(identifiers[j])];
        if (card) entries.push(toOwned(row, card, now, rowKey));
        else if (!("name" in identifiers[j]) || "set" in identifiers[j]) retry.push({ row, ident: { name: row.name } });
        else { missing.push(row.name); entries.push(toOwned(row, undefined, now, rowKey, "not found on Scryfall")); }
      });
      if (retry.length) {
        try {
          const found = await lookup(retry.map((r) => r.ident));
          for (const { row, ident } of retry) {
            const card = found[keyOf(ident)];
            if (card) entries.push(toOwned(row, card, now, rowKey));
            else { missing.push(row.name); entries.push(toOwned(row, undefined, now, rowKey, "not found on Scryfall")); }
          }
        } catch {
          for (const { row } of retry) { missing.push(row.name); entries.push(toOwned(row, undefined, now, rowKey, "lookup failed")); }
        }
      }
      await db.transaction("rw", db.owned, async () => {
        // Two printings in one chunk can land on the same row: fold them before reading what's stored.
        const byId = new Map<string, OwnedCard>();
        for (const e of entries) {
          const prev = byId.get(e.id);
          byId.set(e.id, prev ? { ...prev, ...e, quantity: prev.quantity + e.quantity, card: e.card ?? prev.card } : e);
        }
        const fresh = [...byId.values()];
        const existing = await db.owned.bulkGet(fresh.map((e) => e.id));
        await db.owned.bulkPut(fresh.map((e, k) => {
          const old = existing[k];
          return old ? { ...old, ...e, quantity: old.quantity + e.quantity, card: e.card ?? old.card } : e;
        }));
      });
      done += chunk.length;
      setPhase({ kind: "enriching", done, total });
    };

    // Two lookups in flight: about twice as fast, and still inside Scryfall's 2 requests a second.
    let next = 0;
    const worker = async () => {
      while (!failed && next < chunks.length) {
        try {
          await runChunk(chunks[next++]);
        } catch (e) {
          failed = e instanceof Error ? e.message : "unknown";
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (failed) {
      setPhase({ kind: "error", message: `Scryfall lookup failed: ${failed}. Cards matched so far are saved; try again for the rest.` });
      return;
    }
    // Printings Scryfall has no price for (non-English, promos…): the cheapest priced printing, in one pass.
    try { await priceMissing(); } catch { /* best effort: the Collection page has a button for this */ }
    setPhase({ kind: "done", added: rows.length, missing });
  }, []);

  const importText = useCallback(async (text: string) => {
    setPhase({ kind: "parsing" });
    // The parser (with papaparse) loads on first import, not with the home page.
    const { mergeRows, parseCollectionText, rowKey } = await import("@/lib/csv");
    const parsed = parseCollectionText(text);
    setDetected(parsed.detectedAs);
    if (!parsed.rows.length) {
      setPhase({ kind: "error", message: "No cards found. Check the file has a name column, or lines like “4 Lightning Bolt”." });
      return;
    }
    await enrichAndStore(mergeRows(parsed.rows), rowKey);
  }, [enrichAndStore]);

  const importFile = useCallback(async (file: File) => {
    setPhase({ kind: "parsing" });
    try {
      await importText(await readImportFile(file));
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Import failed" });
    }
  }, [importText]);

  return { phase, setPhase, detected, importText, importFile };
}
