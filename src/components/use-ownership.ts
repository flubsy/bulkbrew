"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/lib/db";
import { isBasic } from "@/lib/scryfall";
import type { BuiltDeck } from "@/lib/types";

/**
 * Where each card in a deck comes from, given your collection and your other saved decks:
 *  - free:    you own enough copies that aren't in a deck marked "built" (spare = what's left over)
 *  - shared:  some of your copies are already in a built deck, so this deck needs more than you have free
 *  - missing: you don't own it at all (shared/imported lists)
 * Decks that are only saved (not marked built) are listed but don't use up copies: every build is
 * saved automatically, so counting them would make everything look taken.
 */
export type OwnStatus = "free" | "shared" | "missing" | "basic";

export interface Ownership {
  status: OwnStatus;
  owned: number;
  /** Copies left in your bulk after this deck and your built decks take theirs. */
  spare: number;
  builtIn: string[];
  savedIn: string[];
}

const title = (b: BuiltDeck) => b.name || b.commanders.map((c) => c.name).join(" / ") || "deck";

export function useOwnership(deck: BuiltDeck, cards: { name: string; quantity: number }[]) {
  const owned = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.owned.each((o) => { const n = o.card?.name ?? o.name; m.set(n, (m.get(n) ?? 0) + o.quantity); });
    return m;
  }, []);
  const others = useLiveQuery(() => db.builds.filter((b) => b.id !== deck.id).toArray(), [deck.id]);

  return useMemo(() => {
    if (!owned || !others) return null;
    const usage = new Map<string, { built: { t: string; q: number }[]; saved: string[] }>();
    for (const b of others) {
      for (const c of [...b.commanders, ...b.cards]) {
        const u = usage.get(c.name) ?? { built: [], saved: [] };
        if (b.inUse) u.built.push({ t: title(b), q: c.quantity });
        else if (!u.saved.includes(title(b))) u.saved.push(title(b));
        usage.set(c.name, u);
      }
    }
    const byName = new Map<string, Ownership>();
    const summary = { free: 0, shared: 0, missing: 0, spare: 0 };
    for (const c of cards) {
      const have = owned.get(c.name) ?? owned.get(c.name.split(" // ")[0]) ?? 0;
      const u = usage.get(c.name) ?? { built: [], saved: [] };
      if (isBasic(c.name)) { byName.set(c.name, { status: "basic", owned: have, spare: 0, builtIn: [], savedIn: [] }); continue; }
      const builtQty = u.built.reduce((s, x) => s + x.q, 0);
      const spare = have - c.quantity - builtQty;
      const status: OwnStatus = have === 0 ? "missing" : spare < 0 ? "shared" : "free";
      byName.set(c.name, { status, owned: have, spare: Math.max(0, spare), builtIn: u.built.map((x) => x.t), savedIn: u.saved });
      summary[status === "free" ? "free" : status === "shared" ? "shared" : "missing"] += c.quantity;
      if (status === "free") summary.spare += Math.max(0, spare);
    }
    return { byName, summary };
  }, [owned, others, cards]);
}
