"use client";

import { db } from "./db";
import { packCollection, postJson } from "./payload";
import { readReserveMode, reservedCounts, withoutReserved } from "./reserve";
import type { BuildOptions, BuiltDeck } from "./types";

export const BUILD_OPTIONS_KEY = "deckbit.buildOptions";

/** Build a deck from the local collection via /api/build and save it. Shared by Build and Roll. */
export async function runBuild(options: BuildOptions, { save = true }: { save?: boolean } = {}): Promise<{ deck: BuiltDeck; aiAvailable: boolean }> {
  const all = (await db.owned.toArray()).filter((c) => c.card);
  if (!all.length) throw new Error("Import your collection first.");
  const owned = withoutReserved(all, reservedCounts(await db.builds.toArray(), readReserveMode()));
  const refs = (await db.refDecks.toArray()).filter((r) => options.referenceDeckIds.includes(r.id));
  const json = await postJson<{ deck: BuiltDeck; aiAvailable: boolean }>("/api/build", { options, owned: packCollection(owned, options.format), refs });
  const deck: BuiltDeck = json.deck;
  if (save) await db.builds.put(deck);
  return { deck, aiAvailable: json.aiAvailable };
}

/** Hand options to the Build page (it restores them from here when it shows). Navigate with the router after. */
export function saveForBuilder(options: BuildOptions) {
  try {
    const prev = JSON.parse(localStorage.getItem(BUILD_OPTIONS_KEY) ?? "{}");
    localStorage.setItem(BUILD_OPTIONS_KEY, JSON.stringify({ ...prev, ...options, include: prev.include ?? "", exclude: prev.exclude ?? "" }));
  } catch { /* ignore */ }
}
