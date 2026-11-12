"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { loadSharedDeck } from "@/lib/share";
import type { BuiltDeck } from "@/lib/types";
import { CardPreviewProvider } from "./card-preview";
import { DeckView } from "./deck-view";
import { Button, Notice } from "./ui";

export const UPGRADE_HANDOFF_KEY = "deckbit.upgradeFrom";

/** Read-only view of a shared deck, with "save a copy" and "upgrade from my collection". */
export function SharedDeck({ id }: { id: string }) {
  const router = useRouter();
  const [deck, setDeck] = useState<BuiltDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSharedDeck(id)
      .then((d) => { if (!alive) return; if (d) setDeck(d); else setError("This link doesn't point to a deck. It may have been mistyped."); })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't open this deck."));
    return () => { alive = false; };
  }, [id]);

  async function saveCopy(): Promise<string> {
    if (saved) return saved;
    const copy: BuiltDeck = { ...deck!, id: `shared_${id}_${Date.now().toString(36)}`, createdAt: Date.now(), shareId: undefined, inUse: undefined };
    await db.builds.put(copy);
    setSaved(copy.id);
    return copy.id;
  }

  async function upgrade() {
    const copyId = await saveCopy();
    try { localStorage.setItem(UPGRADE_HANDOFF_KEY, copyId); } catch { /* ignore */ }
    router.push("/upgrade");
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!deck) return <p className="text-[18px] text-muted">Opening the deck…</p>;

  return (
    <CardPreviewProvider>
      <div className="grid gap-5">
        <div>
          <p className="px-label">Shared deck</p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={saveCopy} disabled={!!saved}>{saved ? "saved to your decks" : "save a copy"}</Button>
            <Button size="sm" variant="ghost" onClick={upgrade}>upgrade it from my collection</Button>
            {saved && <Link href="/saved" className="px-btn px-btn-ghost px-btn-sm inline-block">open saved</Link>}
          </div>
        </div>
        <DeckView deck={deck} readOnly />
      </div>
    </CardPreviewProvider>
  );
}
