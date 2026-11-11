"use client";

import Dexie, { type EntityTable } from "dexie";
import type { BuiltDeck, OwnedCard, ReferenceDeck, WishlistItem } from "./types";

/**
 * Everything lives in the browser (IndexedDB). No accounts, no server storage.
 * The API routes are stateless helpers for scraping, Scryfall, EDHREC and the AI pass.
 * Use Backup/Restore (JSON) on the Collection page to move data between devices.
 */
class DeckbitDB extends Dexie {
  owned!: EntityTable<OwnedCard, "id">;
  refDecks!: EntityTable<ReferenceDeck, "id">;
  builds!: EntityTable<BuiltDeck, "id">;
  wishlist!: EntityTable<WishlistItem, "name">;

  constructor() {
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
  }
}

export const db = new DeckbitDB();

export interface Backup {
  app: "deckbit";
  version: 2;
  exportedAt: number;
  owned: OwnedCard[];
  refDecks: ReferenceDeck[];
  builds: BuiltDeck[];
  wishlist: WishlistItem[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: "deckbit",
    version: 2,
    exportedAt: Date.now(),
    owned: await db.owned.toArray(),
    refDecks: await db.refDecks.toArray(),
    builds: await db.builds.toArray(),
    wishlist: await db.wishlist.toArray(),
  };
}

export async function importBackup(b: Backup, mode: "merge" | "replace") {
  if (b.app !== "deckbit") throw new Error("Not a Deckbit backup file.");
  await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist], async () => {
    if (mode === "replace") {
      await Promise.all([db.owned.clear(), db.refDecks.clear(), db.builds.clear(), db.wishlist.clear()]);
    }
    await db.owned.bulkPut(b.owned ?? []);
    await db.refDecks.bulkPut(b.refDecks ?? []);
    await db.builds.bulkPut(b.builds ?? []);
    await db.wishlist.bulkPut(b.wishlist ?? []);
  });
}
