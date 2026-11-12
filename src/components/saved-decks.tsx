"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db";
import { deckToText, download } from "@/lib/export";
import { FORMATS, type BuiltDeck } from "@/lib/types";
import { CardPreviewProvider } from "./card-preview";
import { DeckView } from "./deck-view";
import { PowerMeter } from "./power-meter";
import { currentPower } from "@/lib/builder/power";
import { Button, Panel } from "./ui";
import { useCurrency } from "./currency-provider";

export function SavedDecks() {
  const builds = useLiveQuery(() => db.builds.orderBy("createdAt").reverse().toArray(), []);
  const [open, setOpen] = useState<BuiltDeck | null>(null);
  const { fmt } = useCurrency();

  if (open) {
    return (
      <CardPreviewProvider>
        <div className="mt-8 grid gap-5">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>← all decks</Button>
          </div>
          <DeckView deck={open} onChange={setOpen} />
        </div>
      </CardPreviewProvider>
    );
  }

  return (
    <div className="mt-8 grid gap-6">
      <Panel title={`Decks (${builds?.length ?? 0})`}>
        {!builds?.length && (
          <p className="text-[18px] text-muted">
            Nothing yet. <a href="/build" className="text-orange underline">Build one</a>.
          </p>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {builds?.map((b) => {
            const title = b.name || b.commanders.map((c) => c.name).join(" / ") || FORMATS.find((f) => f.id === b.options.format)?.label || "Deck";
            return (
              <li key={b.id} className="px-border bg-navy-900 p-4">
                <div className="flex gap-4">
                  {b.commanders[0]?.imageSmall && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.commanders[0].imageSmall} alt="" width={73} height={102} className="h-[102px] w-[73px] shrink-0" style={{ imageRendering: "auto" }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-pixel truncate text-[15px] text-cream">{title}</div>
                    <div className="mt-1 text-[15px] text-muted">
                      {FORMATS.find((f) => f.id === b.options.format)?.label}
                      {b.options.bracket ? ` · bracket ${b.options.bracket}` : ""}
                      {b.options.themes.length ? ` · ${b.options.themes.join(", ")}` : ""}
                    </div>
                    <div className="mt-1 text-[15px] text-cream-dim">
                      {new Date(b.createdAt).toLocaleDateString()} · {b.engine === "ai" ? "AI" : "rules"} · {fmt(b.stats.priceUsd, { whole: true })}
                    </div>
                    {b.cards.length > 0 && <div className="mt-2"><PowerMeter power={currentPower(b)} /></div>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => setOpen(b)}>open</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(deckToText(b))}>copy</Button>
                  <Button size="sm" variant="ghost" onClick={() => download(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`, deckToText(b))}>.txt</Button>
                  <Button size="sm" variant="ghost" aria-pressed={!!b.inUse} onClick={() => db.builds.update(b.id, { inUse: !b.inUse || undefined })} title="Mark decks you've actually put together, so Build and Upgrade can keep their cards out">{b.inUse ? "✓ built" : "mark built"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${title}"?`)) db.builds.delete(b.id); }}>delete</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

    </div>
  );
}
