"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { db } from "@/lib/db";
import { BrewCanvas } from "./pixel/brew-canvas";
import { PixelNumber } from "./pixel/pixel-number";
import { useCollectionImport } from "./use-collection-import";
import { Notice, Progress } from "./ui";

/**
 * The cauldron hero. New visitors: the brew IS the import — drop a CSV/XLSX anywhere on the
 * hero (or paste a list) and the brew surges while cards are matched. Returning players: their
 * own counters in monumental pixel numerals, and the brews they can start right now.
 */
export function HomeHero() {
  const stats = useLiveQuery(async () => {
    const rows = await db.owned.toArray();
    const cards = rows.reduce((s, r) => s + (r.card ? r.quantity : 0), 0);
    return { cards, unique: rows.filter((r) => r.card).length, decks: await db.builds.count() };
  }, []);
  const { phase, detected, importText, importFile } = useCollectionImport();
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [addMore, setAddMore] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = phase.kind === "parsing" || phase.kind === "enriching";
  const returning = !!stats && stats.cards > 0 && !busy && phase.kind !== "done";
  const flare = dragging || busy;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void importFile(f);
  };

  return (
    <section
      aria-labelledby="hero-title"
      className="relative -mx-4 border-b-4 border-navy-600 bg-navy-900"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <div className="mx-auto grid max-w-6xl items-end gap-6 px-4 pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:pt-12">
        <div className="order-2 pb-8 lg:order-1 lg:pb-12">
          <h1 id="hero-title" className="font-wordmark text-[19px] leading-[1.7] text-cream sm:text-[24px] lg:text-[28px]">
            Every card you own.
            <br />
            <span className="text-orange">The best deck it can be.</span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-[20px] text-cream-dim">
            Pour in your collection. BulkBrew builds the strongest Commander deck those exact cards can make, and tells you why every card made it.
          </p>

          {returning ? (
            <div className="mt-7">
              <dl className="flex flex-wrap gap-x-8 gap-y-4">
                <div>
                  <dt className="px-label">Cards in your bulk</dt>
                  <dd><PixelNumber value={stats!.cards} scale={6} /></dd>
                </div>
                <div>
                  <dt className="px-label">Decks brewed</dt>
                  <dd><PixelNumber value={stats!.decks} scale={6} color="var(--orange)" light="#ffd27a" shade="var(--orange-deep)" /></dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/build" className="px-btn inline-block">Brew a deck</Link>
                <Link href="/roll" className="px-btn px-btn-ghost inline-block">Roll a commander</Link>
                <Link href="/upgrade" className="px-btn px-btn-ghost inline-block">Upgrade a deck</Link>
              </div>
              <button type="button" className="mt-4 text-[16px] text-cream-dim underline decoration-orange underline-offset-4 hover:text-cream" onClick={() => setAddMore((v) => !v)} aria-expanded={addMore}>
                {addMore ? "Hide" : "Add more cards to the pot"}
              </button>
            </div>
          ) : null}

          {(!returning || addMore) && (
            <div className="mt-6">
              <div className={`px-border bg-navy-800 p-4 ${dragging ? "px-border-orange" : ""}`}>
                <p className="font-pixel text-[15px] text-cream">
                  {dragging ? "Let go to pour it in" : "Drop your collection into the cauldron"}
                </p>
                <p className="mt-1 text-[16px] text-cream-dim">
                  CSV or Excel from ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield or TCGplayer. Stays in your browser.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="px-btn" onClick={() => fileInput.current?.click()} disabled={busy}>
                    Choose a file
                  </button>
                  <button type="button" className="px-btn px-btn-ghost" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen} aria-controls="hero-paste" disabled={busy}>
                    Paste a list
                  </button>
                  <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
                </div>
                {pasteOpen && (
                  <form id="hero-paste" className="mt-4" onSubmit={(e) => { e.preventDefault(); if (pasted.trim()) void importText(pasted); }}>
                    <label htmlFor="hero-paste-text" className="px-label">Your list, one card per line</label>
                    <textarea id="hero-paste-text" rows={5} className="px-input px-border" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"4 Lightning Bolt\n1 Sol Ring\n1 Rhystic Study"} />
                    <button type="submit" className="px-btn mt-3" disabled={busy || !pasted.trim()}>Pour it in</button>
                  </form>
                )}
              </div>

              <div className="mt-4" aria-live="polite">
                {phase.kind === "parsing" && <Notice>Reading your list…</Notice>}
                {phase.kind === "enriching" && <Progress value={phase.done} max={phase.total} label={`Matching cards on Scryfall${detected ? ` · ${detected}` : ""}`} />}
                {phase.kind === "error" && <Notice tone="error">{phase.message}</Notice>}
                {phase.kind === "done" && (
                  <div className="px-border px-border-orange bg-navy-800 p-4">
                    <p className="font-pixel text-[15px] text-cream">{phase.added.toLocaleString()} cards in the pot.</p>
                    {phase.missing.length > 0 && <p className="mt-1 text-[16px] text-gold">{phase.missing.length} couldn&apos;t be matched. Check them on the Collection page.</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href="/build" className="px-btn inline-block">Brew your first deck</Link>
                      <Link href="/roll" className="px-btn px-btn-ghost inline-block">Roll a commander</Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <BrewCanvas flare={flare} className="order-1 lg:order-2" />
      </div>
    </section>
  );
}
