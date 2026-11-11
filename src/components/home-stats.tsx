"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Stat } from "./ui";

export function HomeStats() {
  const owned = useLiveQuery(async () => {
    const all = await db.owned.toArray();
    const cards = all.reduce((s, c) => s + c.quantity, 0);
    const value = all.reduce((s, c) => s + (c.card?.priceUsd ?? 0) * c.quantity, 0);
    const enriched = all.filter((c) => c.card).length;
    return { unique: all.length, cards, value, enriched };
  }, []);
  const decks = useLiveQuery(() => db.refDecks.count(), [], 0);
  const builds = useLiveQuery(() => db.builds.count(), [], 0);

  return (
    <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Cards owned" value={owned ? owned.cards.toLocaleString() : "—"} sub={owned ? `${owned.unique.toLocaleString()} unique` : "import to begin"} />
      <Stat label="Collection value" value={owned ? `$${Math.round(owned.value).toLocaleString()}` : "—"} sub="Scryfall USD, cheapest printing" />
      <Stat label="Reference decks" value={decks ?? 0} sub="scraped for scoring" />
      <Stat label="Builds" value={builds ?? 0} sub="saved on this device" />
    </section>
  );
}
