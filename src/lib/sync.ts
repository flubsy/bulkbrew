"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { db, SYNCED, syncFlags, table, type SyncKind } from "./db";

/**
 * Two-way sync between this device's IndexedDB and the user's rows in Supabase (user_data).
 *
 *   push: upload every row marked _dirty and every tombstone, then clear the marks.
 *   pull: download rows changed since our cursor (server time) and apply them locally,
 *         skipping rows that changed locally in the meantime (those win on the next push).
 *
 * Conflicts resolve as "last write to reach the server wins", which is fine for one person
 * using a couple of devices.
 */

const CHUNK = 400;
const PAGE = 1000;

type Row = { kind: SyncKind; id: string; data: unknown; deleted: boolean; updated_at: string };

export interface SyncResult {
  pushed: number;
  pulled: number;
  at: number;
}

async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

function keyOf(kind: SyncKind, row: Record<string, unknown>): string {
  return String(kind === "wishlist" ? row.name : row.id);
}

/** Count of local changes waiting to upload. */
export async function pendingCount(): Promise<number> {
  let n = await db.tombstones.count();
  for (const k of SYNCED) n += await table(k).where("_dirty").equals(1).count();
  return n;
}

/** Which account this device's data was last synced with. */
export async function linkedUser(): Promise<string | undefined> {
  return getMeta<string>("linkedUser");
}

/** Does this device hold any data at all? */
export async function hasLocalData(): Promise<boolean> {
  for (const k of SYNCED) if ((await table(k).count()) > 0) return true;
  return false;
}

/**
 * First sign-in on this device (or a different account): decide what happens to local data.
 *   merge   — upload everything here to the account (union with what's already there)
 *   replace — throw away local data and take the account's copy
 */
export async function linkDevice(userId: string, mode: "merge" | "replace") {
  if (mode === "replace") {
    syncFlags.applyingRemote = true;
    try {
      await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist, db.tombstones], async () => {
        for (const k of SYNCED) await table(k).clear();
        await db.tombstones.clear();
      });
    } finally {
      syncFlags.applyingRemote = false;
    }
  } else {
    // Mark everything dirty so the next push uploads it.
    syncFlags.applyingRemote = true;
    try {
      await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist], async () => {
        for (const k of SYNCED) await table(k).toCollection().modify({ _dirty: 1, updatedAt: Date.now() });
      });
    } finally {
      syncFlags.applyingRemote = false;
    }
  }
  await setMeta("linkedUser", userId);
  await setMeta(`cursor:${userId}`, null);
}

async function push(sb: SupabaseClient, userId: string): Promise<number> {
  let pushed = 0;
  for (const kind of SYNCED) {
    const t = table(kind);
    const dirty = (await t.where("_dirty").equals(1).toArray()) as Record<string, unknown>[];
    for (let i = 0; i < dirty.length; i += CHUNK) {
      const chunk = dirty.slice(i, i + CHUNK);
      const rows = chunk.map((r) => {
        const { _dirty, updatedAt, ...data } = r;
        void _dirty; void updatedAt;
        return { user_id: userId, kind, id: keyOf(kind, r), data, deleted: false };
      });
      const { error } = await sb.from("user_data").upsert(rows, { onConflict: "user_id,kind,id" });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      // Clear the dirty mark only if the row hasn't changed again while we were uploading.
      syncFlags.applyingRemote = true;
      try {
        await db.transaction("rw", t, async () => {
          for (const r of chunk) {
            const key = keyOf(kind, r);
            const now = (await t.get(key)) as Record<string, unknown> | undefined;
            if (now && now.updatedAt === r.updatedAt) await t.update(key as never, { _dirty: undefined });
          }
        });
      } finally {
        syncFlags.applyingRemote = false;
      }
      pushed += chunk.length;
    }
  }

  const tombs = await db.tombstones.toArray();
  for (let i = 0; i < tombs.length; i += CHUNK) {
    const chunk = tombs.slice(i, i + CHUNK);
    const rows = chunk.map((t) => ({ user_id: userId, kind: t.kind, id: t.id, data: null, deleted: true }));
    const { error } = await sb.from("user_data").upsert(rows, { onConflict: "user_id,kind,id" });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    await db.tombstones.bulkDelete(chunk.map((t) => t.key));
    pushed += chunk.length;
  }
  return pushed;
}

async function pull(sb: SupabaseClient, userId: string): Promise<number> {
  let cursor = (await getMeta<string | null>(`cursor:${userId}`)) ?? null;
  let pulled = 0;
  for (;;) {
    let q = sb.from("user_data").select("kind,id,data,deleted,updated_at").order("updated_at", { ascending: true }).limit(PAGE);
    if (cursor) q = q.gt("updated_at", cursor);
    const { data, error } = await q;
    if (error) throw new Error(`Download failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (!rows.length) break;

    syncFlags.applyingRemote = true;
    try {
      await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist, db.tombstones], async () => {
        for (const r of rows) {
          if (!(SYNCED as readonly string[]).includes(r.kind)) continue;
          const t = table(r.kind);
          const local = (await t.get(r.id)) as Record<string, unknown> | undefined;
          if (local?._dirty) continue; // local edit pending: it will win on the next push
          if (await db.tombstones.get(`${r.kind}:${r.id}`)) continue; // deleted here, not yet pushed
          if (r.deleted) {
            if (local) await t.delete(r.id);
          } else if (r.data) {
            await t.put(r.data as Record<string, unknown>);
          }
        }
      });
    } finally {
      syncFlags.applyingRemote = false;
    }
    pulled += rows.length;
    cursor = rows[rows.length - 1].updated_at;
    await setMeta(`cursor:${userId}`, cursor);
    if (rows.length < PAGE) break;
  }
  return pulled;
}

let running: Promise<SyncResult> | null = null;

/** Push then pull. Concurrent calls share one run. */
export function syncNow(sb: SupabaseClient, userId: string): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    try {
      const pushed = await push(sb, userId);
      const pulled = await pull(sb, userId);
      const at = Date.now();
      await setMeta(`lastSync:${userId}`, at);
      return { pushed, pulled, at };
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function lastSync(userId: string): Promise<number | undefined> {
  return getMeta<number>(`lastSync:${userId}`);
}

/** Wipe this user's cloud copy (local data is untouched). */
export async function deleteCloudData(sb: SupabaseClient) {
  const { error } = await sb.rpc("delete_my_data");
  if (error) throw new Error(error.message);
}

/**
 * Remove all cards/decks from THIS device only (e.g. signing out of a shared computer).
 * Doesn't create tombstones, so nothing is deleted from the account, and resets the cursor so
 * the next sign-in downloads everything again.
 */
export async function wipeLocal(userId?: string) {
  syncFlags.applyingRemote = true;
  try {
    await db.transaction("rw", [db.owned, db.refDecks, db.builds, db.wishlist, db.tombstones], async () => {
      for (const k of SYNCED) await table(k).clear();
      await db.tombstones.clear();
    });
  } finally {
    syncFlags.applyingRemote = false;
  }
  if (userId) await setMeta(`cursor:${userId}`, null);
}
