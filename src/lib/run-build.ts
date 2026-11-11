"use client";

import { db } from "./db";
import type { BuildOptions, BuiltDeck } from "./types";

export const BUILD_OPTIONS_KEY = "deckbit.buildOptions";

/** Build a deck from the local collection via /api/build and save it. Shared by Build and Roll. */
export async function runBuild(options: BuildOptions): Promise<{ deck: BuiltDeck; aiAvailable: boolean }> {
  const owned = (await db.owned.toArray()).filter((c) => c.card);
  if (!owned.length) throw new Error("Import your collection first.");
  const refs = (await db.refDecks.toArray()).filter((r) => options.referenceDeckIds.includes(r.id));
  const res = await fetch("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options, owned: owned.map((c) => ({ card: c.card, quantity: c.quantity })), refs }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  const deck: BuiltDeck = json.deck;
  await db.builds.put(deck);
  return { deck, aiAvailable: json.aiAvailable };
}

/** Hand options to the Build page (it restores them from here when it shows). Navigate with the router after. */
export function saveForBuilder(options: BuildOptions) {
  try {
    const prev = JSON.parse(localStorage.getItem(BUILD_OPTIONS_KEY) ?? "{}");
    localStorage.setItem(BUILD_OPTIONS_KEY, JSON.stringify({ ...prev, ...options, include: prev.include ?? "", exclude: prev.exclude ?? "" }));
  } catch { /* ignore */ }
}
