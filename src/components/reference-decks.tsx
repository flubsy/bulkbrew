"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db";
import type { ReferenceDeck } from "@/lib/types";
import { Button, Input, Label, Notice, Panel, TextArea } from "./ui";

export function ReferenceDecks() {
  const decks = useLiveQuery(() => db.refDecks.orderBy("fetchedAt").reverse().toArray(), []);
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const [urls, setUrls] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ok: boolean; msg: string }[]>([]);

  const ownedNames = new Set((owned ?? []).map((c) => c.name.toLowerCase()));

  async function addUrls() {
    const list = urls.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    setLog([]);
    for (const url of list) {
      try {
        const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const deck: ReferenceDeck = json.deck;
        await db.refDecks.put(deck);
        setLog((l) => [...l, { ok: true, msg: `${deck.name} — ${deck.cards.length} cards (${deck.source})` }]);
      } catch (e) {
        setLog((l) => [...l, { ok: false, msg: `${url}: ${e instanceof Error ? e.message : "failed"}` }]);
      }
    }
    setUrls("");
    setBusy(false);
  }

  async function addText() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, name }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await db.refDecks.put(json.deck as ReferenceDeck);
      setLog([{ ok: true, msg: `${json.deck.name} — ${json.deck.cards.length} cards` }]);
      setText("");
      setName("");
    } catch (e) {
      setLog([{ ok: false, msg: e instanceof Error ? e.message : "failed" }]);
    }
    setBusy(false);
  }

  return (
    <div className="mt-8 grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Add by URL">
          <Label hint="one per line">Deck links</Label>
          <TextArea rows={5} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://moxfield.com/decks/…\nhttps://archidekt.com/decks/…\nhttps://www.mtggoldfish.com/deck/…"} />
          <div className="mt-3">
            <Button onClick={addUrls} disabled={busy || !urls.trim()}>
              {busy ? "Fetching…" : "Fetch decks"}
            </Button>
          </div>
          <p className="mt-3 text-[16px] text-muted">Moxfield blocks most scrapers. If a Moxfield link fails, open the deck, Export → copy text, and paste it on the right.</p>
        </Panel>
        <Panel title="Add by text">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ur-Dragon upgraded" />
          <div className="mt-3">
            <Label hint="supports Commander / Sideboard headings">Decklist</Label>
            <TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Commander\n1 The Ur-Dragon\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n…"} />
          </div>
          <div className="mt-3">
            <Button onClick={addText} disabled={busy || !text.trim()}>
              Add deck
            </Button>
          </div>
        </Panel>
      </div>

      {log.length > 0 && (
        <div className="grid gap-2">
          {log.map((l, i) => (
            <Notice key={i} tone={l.ok ? "ok" : "error"}>
              {l.msg}
            </Notice>
          ))}
        </div>
      )}

      <Panel title={`Saved decks (${decks?.length ?? 0})`}>
        {!decks?.length && <p className="text-[18px] text-muted">Nothing yet. Add a few decks in the archetype you want to build.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {decks?.map((d) => {
            const main = d.cards.filter((c) => c.board === "main" || c.board === "commander");
            const ownedCount = main.filter((c) => ownedNames.has(c.name.toLowerCase())).length;
            return (
              <li key={d.id} className="px-border bg-navy-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-pixel text-[15px] text-cream">{d.name}</div>
                    <div className="mt-2 text-[16px] text-muted">
                      {d.source}
                      {d.format ? ` · ${d.format}` : ""}
                      {d.commanders.length ? ` · ${d.commanders.join(" / ")}` : ""}
                    </div>
                    <div className="mt-1 text-[17px] text-cream-dim">
                      {main.length} cards · you own <span className={ownedCount / Math.max(1, main.length) > 0.5 ? "text-green" : "text-gold"}>{ownedCount}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => db.refDecks.delete(d.id)} aria-label={`Remove ${d.name}`}>
                    ✕
                  </Button>
                </div>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[15px] text-orange underline">
                    open source
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
