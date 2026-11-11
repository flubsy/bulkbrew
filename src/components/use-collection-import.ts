"use client";

import { useCallback, useState } from "react";
import { mergeRows, parseCollectionText, rowKey } from "@/lib/csv";
import { db } from "@/lib/db";
import { keyOf, type Identifier } from "@/lib/scryfall";
import type { CardData, CollectionRow, OwnedCard } from "@/lib/types";

/**
 * Collection import, shared by the Collection page and the home page's cauldron:
 * read a CSV/TSV/XLSX file or pasted list, match every row to Scryfall (75 per request,
 * retrying set+number misses by name), and merge the results into the local collection.
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

function toOwned(row: CollectionRow, card: CardData | undefined, now: number, err?: string): OwnedCard {
  return { ...row, id: card?.scryfallId ?? rowKey(row), card, enrichError: err, importedAt: now };
}

async function lookup(identifiers: Identifier[]): Promise<Record<string, CardData>> {
  const res = await fetch("/api/scryfall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifiers }) });
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

  const enrichAndStore = useCallback(async (rows: CollectionRow[]) => {
    const total = rows.length;
    setPhase({ kind: "enriching", done: 0, total });
    const missing: string[] = [];
    const now = Date.now();
    const CHUNK = 75;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const identifiers = chunk.map(toIdentifier);
      let cards: Record<string, CardData>;
      try {
        cards = await lookup(identifiers);
      } catch (e) {
        setPhase({ kind: "error", message: `Scryfall lookup failed: ${e instanceof Error ? e.message : "unknown"}. Cards matched so far are saved; try again for the rest.` });
        return;
      }
      const retry: { row: CollectionRow; ident: Identifier }[] = [];
      const entries: OwnedCard[] = [];
      chunk.forEach((row, j) => {
        const card = cards[keyOf(identifiers[j])];
        if (card) entries.push(toOwned(row, card, now));
        else if (!("name" in identifiers[j]) || "set" in identifiers[j]) retry.push({ row, ident: { name: row.name } });
        else { missing.push(row.name); entries.push(toOwned(row, undefined, now, "not found on Scryfall")); }
      });
      if (retry.length) {
        try {
          const found = await lookup(retry.map((r) => r.ident));
          for (const { row, ident } of retry) {
            const card = found[keyOf(ident)];
            if (card) entries.push(toOwned(row, card, now));
            else { missing.push(row.name); entries.push(toOwned(row, undefined, now, "not found on Scryfall")); }
          }
        } catch {
          for (const { row } of retry) { missing.push(row.name); entries.push(toOwned(row, undefined, now, "lookup failed")); }
        }
      }
      await db.transaction("rw", db.owned, async () => {
        for (const e of entries) {
          const existing = await db.owned.get(e.id);
          if (existing) await db.owned.put({ ...existing, ...e, quantity: existing.quantity + e.quantity, card: e.card ?? existing.card });
          else await db.owned.put(e);
        }
      });
      setPhase({ kind: "enriching", done: Math.min(total, i + CHUNK), total });
    }
    setPhase({ kind: "done", added: rows.length, missing });
  }, []);

  const importText = useCallback(async (text: string) => {
    setPhase({ kind: "parsing" });
    const parsed = parseCollectionText(text);
    setDetected(parsed.detectedAs);
    if (!parsed.rows.length) {
      setPhase({ kind: "error", message: "No cards found. Check the file has a name column, or lines like “4 Lightning Bolt”." });
      return;
    }
    await enrichAndStore(mergeRows(parsed.rows));
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
