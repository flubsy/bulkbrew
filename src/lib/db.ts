"use client";

import Dexie, { type EntityTable, type Table } from "dexie";
import type { BuiltDeck, OwnedCard, ReferenceDeck, WishlistItem } from "./types";

/**
 * Local-first storage (IndexedDB). The app always reads and writes here; when signed in,
 * src/lib/sync.ts mirrors these tables to the user's account in the background.
 *
 * Sync bookkeeping (added in schema v3):
 *   _dirty: 1     — changed locally, not yet uploaded (indexed so we can find them fast)
 *   updatedAt     — local change time (ms)
 *   tombstones    — keys deleted locally, waiting to be deleted remotely
 *
 * Schema rule: never edit an existing version() block — friends have data in older versions.
 * Add a new version and, if needed, an .upgrade() that migrates.
 */

export type Synced<T> = T & { _dirty?: 1; updatedAt?: number };

export const SYNCED = ["owned", "refDecks", "builds", "wishlist"] as const;
export type SyncKind = (typeof SYNCED)[number];

class BulkBrewDB extends Dexie {
  owned!: EntityTable<Synced<OwnedCard>, "id">;
  refDecks!: EntityTable<Synced<ReferenceDeck>, "id">;
  builds!: EntityTable<Synced<BuiltDeck>, "id">;
  wishlist!: EntityTable<Synced<WishlistItem>, "name">;
  tombstones!: EntityTable<{ key: string; kind: SyncKind; id: string; at: number }, "key">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;

  constructor() {
    // Database and storage keys keep the old "deckbit" name on purpose: renaming them would
    // strand everyone's existing collection in a database the app no longer opens.
    super("deckbit");
    this.version(1).stores({
      owned: "id, name, setCode, importedAt",
      refDecks: "id, source, fetchedAt",
      builds: "id, createdAt",
    });
    this.version(2).stores({
      owned: "id, name, setCode, importedAt",
      refDecks: "id, source, fetchedAt",
      builds: "id, createdAt",
      wishlist: "name, addedAt",
    });
    this.version(3).stores({
      owned: "id, name, setCode, importedAt, _dirty",
      refDecks: "id, source, fetchedAt, _dirty",
      builds: "id, createdAt, _dirty",
      wishlist: "name, addedAt, _dirty",
      tombstones: "key, kind",
      meta: "key",
    });
  }
}

export const db = new BulkBrewDB();

type AnyRow = Synced<Record<string, unknown>>;

/** A synced table viewed as plain records keyed by string (for the generic sync code). */
export function table(kind: SyncKind): Table<AnyRow, string> {
  return db[kind] as unknown as Table<AnyRow, string>;
}

/* ----------------------------- change tracking ----------------------------- */

/** Set while sync applies remote rows, so they aren't marked dirty again. */
export const syncFlags = { applyingRemote: false };

const pendingTombstones: { kind: SyncKind; id: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notifyDirty() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("deckbit:dirty"));
}

function queueTombstone(kind: SyncKind, id: string) {
  pendingTombstones.push({ kind, id });
  if (flushTimer) return;
  // Hooks run inside the caller's transaction, which doesn't include `tombstones`, so write after it.
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const batch = pendingTombstones.splice(0);
    await db.tombstones.bulkPut(batch.map((t) => ({ key: `${t.kind}:${t.id}`, kind: t.kind, id: t.id, at: Date.now() })));
    notifyDirty();
  }, 0);
}

if (typeof window !== "undefined") {
  for (const kind of SYNCED) {
    const t = table(kind);
    t.hook("creating", (_pk, obj) => {
      if (syncFlags.applyingRemote) return;
      obj._dirty = 1;
      obj.updatedAt = Date.now();
      setTimeout(notifyDirty, 0);
    });
    t.hook("updating", () => {
      if (syncFlags.applyingRemote) return;
      setTimeout(notifyDirty, 0);
      return { _dirty: 1, updatedAt: Date.now() };
    });
    t.hook("deleting", (pk) => {
      if (syncFlags.applyingRemote) return;
      queueTombstone(kind, String(pk));
    });
  }
}

/** Delete every row in a table one by one, so each deletion syncs (Table.clear() skips hooks). */
export async function clearSynced(kind: SyncKind) {
  const t = table(kind);
  const keys = (await t.toCollection().primaryKeys()) as string[];
  if (keys.length) await t.bulkDelete(keys);
}

/* ----------------------------- backup / restore ----------------------------- */

export interface Backup {
  app: "deckbit";
  version: 2;
  exportedAt: number;
  owned: OwnedCard[];
  refDecks: ReferenceDeck[];
  builds: BuiltDeck[];
  wishlist: WishlistItem[];
}

const strip = <T,>(rows: Synced<T>[]): T[] => rows.map(({ _dirty, updatedAt, ...r }) => { void _dirty; void updatedAt; return r as T; });

export async function exportBackup(): Promise<Backup> {
  return {
    app: "deckbit",
    version: 2,
    exportedAt: Date.now(),
    owned: strip(await db.owned.toArray()),
    refDecks: strip(await db.refDecks.toArray()),
    builds: strip(await db.builds.toArray()),
    wishlist: strip(await db.wishlist.toArray()),
  };
}

export async function importBackup(b: Backup, mode: "merge" | "replace") {
  if (b.app !== "deckbit") throw new Error("Not a BulkBrew backup file.");
  if (mode === "replace") for (const k of SYNCED) await clearSynced(k);
  await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist], async () => {
    await db.owned.bulkPut(b.owned ?? []);
    await db.refDecks.bulkPut(b.refDecks ?? []);
    await db.builds.bulkPut(b.builds ?? []);
    await db.wishlist.bulkPut(b.wishlist ?? []);
  });
}
