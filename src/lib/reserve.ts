"use client";

import { useEffect, useState } from "react";
import { isBasic } from "./scryfall";
import type { BuiltDeck, OwnedCard } from "./types";

/**
 * "Cards already in another deck" — so the builder and upgrader don't pull a card out of a deck
 * you've sleeved up. Counts copies: own 2 Sol Rings with 1 in another deck → 1 is still free.
 *
 * Scope: every saved deck, or only decks marked "built" (Saved → mark as built). Every build is
 * saved automatically, so "built only" is the one to use once you've marked your real decks.
 */

export type ReserveMode = "off" | "all" | "built";
const KEY = "deckbit.reserve";

export function useReserveMode(): [ReserveMode, (m: ReserveMode) => void] {
  const [mode, setMode] = useState<ReserveMode>("off");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem(KEY);
        if (v === "all" || v === "built" || v === "off") setMode(v);
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const set = (m: ReserveMode) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  return [mode, set];
}

export function readReserveMode(): ReserveMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "all" || v === "built" ? v : "off";
  } catch {
    return "off";
  }
}

/** name → copies used by the decks in scope (skipping `exceptIds`, e.g. the deck being upgraded). */
export function reservedCounts(builds: BuiltDeck[], mode: ReserveMode, exceptIds: string[] = []): Map<string, number> {
  const out = new Map<string, number>();
  if (mode === "off") return out;
  for (const b of builds) {
    if (exceptIds.includes(b.id)) continue;
    if (mode === "built" && !b.inUse) continue;
    for (const c of [...b.commanders, ...b.cards]) {
      if (isBasic(c.name)) continue;
      out.set(c.name, (out.get(c.name) ?? 0) + c.quantity);
    }
  }
  return out;
}

/** The collection minus reserved copies (rows with nothing left are dropped). */
export function withoutReserved<T extends Pick<OwnedCard, "card" | "quantity">>(owned: T[], reserved: Map<string, number>): T[] {
  if (!reserved.size) return owned;
  const left = new Map(reserved);
  const out: T[] = [];
  for (const o of owned) {
    const name = o.card?.name;
    const r = name ? left.get(name) ?? 0 : 0;
    if (!r) { out.push(o); continue; }
    const take = Math.min(r, o.quantity);
    left.set(name!, r - take);
    if (o.quantity - take > 0) out.push({ ...o, quantity: o.quantity - take });
  }
  return out;
}

export const RESERVE_LABEL: Record<ReserveMode, string> = {
  off: "Use every card I own",
  all: "Skip cards in any saved deck",
  built: "Skip cards in decks marked “built”",
};
