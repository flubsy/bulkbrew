import Papa from "papaparse";
import type { CollectionRow } from "./types";

/**
 * Collection import. Accepts:
 *  - CSV / TSV text (ManaBox, Moxfield, Archidekt, Deckbox, DragonShield, TCGplayer, or any
 *    sheet with a "name" column and some kind of "quantity" column)
 *  - plain decklist text ("4 Lightning Bolt", "1 Sol Ring (C21) 123")
 * Header matching is fuzzy so copied Google Sheets / Excel exports work too.
 */

const HEADER_ALIASES: Record<keyof CollectionRow, string[]> = {
  name: ["name", "card name", "card", "cardname", "card_name", "product name", "simple name"],
  quantity: ["quantity", "qty", "count", "amount", "owned", "have", "total qty", "reg qty", "normal"],
  setCode: ["set code", "set", "setcode", "edition code", "edition", "set_code", "expansion code", "code"],
  collectorNumber: ["collector number", "collector #", "card number", "number", "collector_number", "cn", "collectornumber"],
  scryfallId: ["scryfall id", "scryfall_id", "scryfallid", "id"],
  foil: ["foil", "finish", "printing", "foil qty", "is foil"],
  condition: ["condition"],
  language: ["language", "lang"],
  purchasePrice: ["purchase price", "price", "purchase_price", "cost"],
  tags: ["tags", "tag", "folder", "binder"],
};

function norm(h: string) {
  return h.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function pickHeader(headers: string[], field: keyof CollectionRow): string | undefined {
  const normalized = headers.map((h) => [h, norm(h)] as const);
  for (const alias of HEADER_ALIASES[field]) {
    const hit = normalized.find(([, n]) => n === alias);
    if (hit) return hit[0];
  }
  // Loose contains-match as a last resort, but never for the ambiguous ones.
  if (field === "name" || field === "quantity") {
    for (const alias of HEADER_ALIASES[field]) {
      const hit = normalized.find(([, n]) => n.includes(alias));
      if (hit) return hit[0];
    }
  }
  return undefined;
}

function toInt(v: unknown, fallback = 1): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function toBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "foil" || s === "true" || s === "yes" || s === "1" || s === "etched" || s === "y";
}

/** Strip DFC backs, set markers and *F* flags from a decklist line. */
const DECKLIST_LINE = /^\s*(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s*([\w★-]+)?)?\s*(\*[A-Z]\*)?\s*$/;

export function parseDecklistText(text: string): CollectionRow[] {
  const out: CollectionRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    if (/^(commander|deck|main|mainboard|sideboard|maybeboard|companion)s?:?$/i.test(line)) continue;
    const m = DECKLIST_LINE.exec(line);
    if (m) {
      out.push({
        name: m[2].trim(),
        quantity: toInt(m[1], 1),
        setCode: m[3]?.toLowerCase(),
        collectorNumber: m[4],
        foil: !!m[5],
      });
    } else if (/^[A-Za-z]/.test(line)) {
      out.push({ name: line.replace(/\s*\/\/.*$/, "").trim(), quantity: 1 });
    }
  }
  return out;
}

export interface ParseResult {
  rows: CollectionRow[];
  detectedAs: string;
  headers: string[];
  skipped: number;
}

export function parseCollectionText(text: string): ParseResult {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { rows: [], detectedAs: "empty", headers: [], skipped: 0 };

  // Does this look like a delimited table with a header row?
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const looksTabular = /[,\t;]/.test(firstLine) && !/^\d+\s*x?\s+/.test(firstLine);

  if (!looksTabular) {
    const rows = parseDecklistText(trimmed);
    return { rows, detectedAs: "decklist text", headers: [], skipped: 0 };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const nameH = pickHeader(headers, "name");
  if (!nameH) {
    // No usable header — maybe the file has no header row. Fall back to decklist parsing.
    const rows = parseDecklistText(trimmed);
    return { rows, detectedAs: "decklist text (no header found)", headers, skipped: 0 };
  }
  const qtyH = pickHeader(headers, "quantity");
  const setH = pickHeader(headers, "setCode");
  const cnH = pickHeader(headers, "collectorNumber");
  const idH = pickHeader(headers, "scryfallId");
  const foilH = pickHeader(headers, "foil");
  const condH = pickHeader(headers, "condition");
  const langH = pickHeader(headers, "language");
  const priceH = pickHeader(headers, "purchasePrice");
  const tagsH = pickHeader(headers, "tags");

  const detectedAs = detectSource(headers);
  let skipped = 0;
  const rows: CollectionRow[] = [];
  for (const r of parsed.data) {
    const name = (r[nameH] ?? "").trim();
    if (!name) { skipped++; continue; }
    const quantity = qtyH ? toInt(r[qtyH], 1) : 1;
    if (quantity <= 0) { skipped++; continue; }
    const scryfallId = idH ? (r[idH] ?? "").trim() : "";
    rows.push({
      name: name.replace(/\s*\/\/.*$/, "").trim() === "" ? name : name,
      quantity,
      setCode: setH ? (r[setH] ?? "").trim().toLowerCase() || undefined : undefined,
      collectorNumber: cnH ? (r[cnH] ?? "").trim() || undefined : undefined,
      scryfallId: /^[0-9a-f-]{36}$/i.test(scryfallId) ? scryfallId : undefined,
      foil: foilH ? toBool(r[foilH]) : undefined,
      condition: condH ? r[condH]?.trim() : undefined,
      language: langH ? r[langH]?.trim() : undefined,
      purchasePrice: priceH ? toFloat(r[priceH]) : undefined,
      tags: tagsH && r[tagsH] ? r[tagsH].split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : undefined,
    });
  }
  return { rows, detectedAs, headers, skipped };
}

function detectSource(headers: string[]): string {
  const h = headers.map(norm);
  if (h.includes("manabox id")) return "ManaBox export";
  if (h.includes("tradelist count") && h.includes("edition")) return "Moxfield / Deckbox export";
  if (h.includes("edition code") && h.includes("finish")) return "Archidekt export";
  if (h.includes("product name")) return "TCGplayer export";
  if (h.includes("card name") && h.includes("set code")) return "Dragon Shield export";
  return "generic CSV";
}

/** Merge duplicate printings by (scryfallId || name+set+number) summing quantities. */
export function mergeRows(rows: CollectionRow[]): CollectionRow[] {
  const map = new Map<string, CollectionRow>();
  for (const r of rows) {
    const key = r.scryfallId ?? `${r.name.toLowerCase()}|${r.setCode ?? ""}|${r.collectorNumber ?? ""}`;
    const existing = map.get(key);
    if (existing) existing.quantity += r.quantity;
    else map.set(key, { ...r });
  }
  return [...map.values()];
}

export function rowKey(r: CollectionRow): string {
  return r.scryfallId ?? `${r.name.toLowerCase()}|${r.setCode ?? ""}|${r.collectorNumber ?? ""}`;
}
