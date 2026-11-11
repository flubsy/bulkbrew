"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { creatureTypes } from "@/lib/builder/classify";
import type { UpgradeOptions } from "@/lib/builder/upgrade";
import { db } from "@/lib/db";
import { mapEdhrecTag } from "@/lib/tags";
import { BRACKETS, type BuildOptions, type BuiltDeck, type EdhrecTag, type ReferenceDeck } from "@/lib/types";
import { CardPreviewProvider } from "./card-preview";
import { DeckView } from "./deck-view";
import { Button, Disclosure, Input, Label, Notice, Panel, Select, TextArea } from "./ui";

type Source = "url" | "paste" | "saved";

const GAIN_PRESETS = [
  { v: 1.5, label: "Any upgrade (lots of small swaps)" },
  { v: 3, label: "Clear upgrades (recommended)" },
  { v: 6, label: "Big upgrades only" },
];

export function DeckUpgrader() {
  return (
    <CardPreviewProvider>
      <Inner />
    </CardPreviewProvider>
  );
}

function Inner() {
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const builds = useLiveQuery(() => db.builds.orderBy("createdAt").reverse().toArray(), []);
  const refDecks = useLiveQuery(() => db.refDecks.orderBy("fetchedAt").reverse().toArray(), []);

  const [source, setSource] = useState<Source>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [savedId, setSavedId] = useState("");
  const [deck, setDeck] = useState<ReferenceDeck | null>(null);
  const [needCommander, setNeedCommander] = useState<string[] | null>(null);
  const [commanderPick, setCommanderPick] = useState("");
  const [tags, setTags] = useState<EdhrecTag[]>([]);
  const [tag, setTag] = useState<string | undefined>();

  const [bracket, setBracket] = useState<BuildOptions["bracket"]>(3);
  const [maxSwaps, setMaxSwaps] = useState(10);
  const [minGain, setMinGain] = useState(3);
  const [allowLands, setAllowLands] = useState(true);
  const [protect, setProtect] = useState("");
  const [never, setNever] = useState("");
  const [skipSaved, setSkipSaved] = useState(false);
  const [useEdhrec, setUseEdhrec] = useState(true);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuiltDeck | null>(null);

  const enriched = useMemo(() => (owned ?? []).filter((c) => c.card), [owned]);
  const knownTypes = useMemo(() => [...new Set(enriched.flatMap((c) => creatureTypes(c.card!.typeLine)))], [enriched]);
  const commanders = useMemo(() => (deck?.commanders.length ? deck.commanders : commanderPick ? [commanderPick] : []), [deck, commanderPick]);

  // EDHREC tags for the deck's commander, so the upgrade can lean into one build.
  useEffect(() => {
    if (!commanders[0]) return;
    let alive = true;
    fetch(`/api/edhrec/commander?name=${encodeURIComponent(commanders[0])}${commanders[1] ? `&partner=${encodeURIComponent(commanders[1])}` : ""}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setTags(j.tags ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [commanders]);

  async function load() {
    setError(null);
    setResult(null);
    setNeedCommander(null);
    setCommanderPick("");
    setTag(undefined);
    setTags([]);
    try {
      if (source === "saved") {
        const b = builds?.find((x) => x.id === savedId);
        const r = refDecks?.find((x) => x.id === savedId);
        if (b) {
          setDeck({
            id: `build:${b.id}`, source: "text", url: "", name: b.name ?? b.commanders.map((c) => c.name).join(" / "),
            commanders: b.commanders.map((c) => c.name),
            cards: [...b.commanders.map((c) => ({ name: c.name, quantity: 1, board: "commander" as const })), ...b.cards.map((c) => ({ name: c.name, quantity: c.quantity, board: "main" as const }))],
            fetchedAt: Date.now(),
          });
          setBracket(b.options.bracket ?? 3);
        } else if (r) setDeck(r);
        else throw new Error("Pick a deck first.");
        return;
      }
      setBusy("Fetching the decklist…");
      const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source === "url" ? { url } : { text, name: "Pasted deck" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDeck(json.deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that deck");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    if (!deck) return;
    setError(null);
    setResult(null);
    setBusy("Scoring your list and your collection, then finding the best swaps…");
    try {
      const savedNames = skipSaved ? (builds ?? []).flatMap((b) => b.cards.map((c) => c.name)) : [];
      const neverList = [...never.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean), ...savedNames];
      const mapped = tag ? mapEdhrecTag(tag, knownTypes) : { themes: [] as BuildOptions["themes"], tribe: undefined };
      const build: BuildOptions = {
        format: "commander",
        bracket,
        themes: mapped.themes,
        tribe: mapped.tribe,
        edhrecTag: tag,
        includeCards: [],
        excludeCards: neverList,
        referenceDeckIds: [],
        useAI: false,
        useEdhrec,
        assumeBasics: true,
        preferCheap: false,
        mustOwnEverything: true,
      };
      const upgrade: UpgradeOptions = { maxSwaps, minGain, protect: protect.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean), allowLandSwaps: allowLands };
      const res = await fetch("/api/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck, commanders, owned: enriched.map((c) => ({ card: c.card, quantity: c.quantity })), build, upgrade }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.needCommander) {
        setNeedCommander(json.needCommander);
        setError(json.needCommander.length ? "This list doesn't mark a commander. Pick it below and run again." : "No legendary creature found in this list to use as commander.");
        return;
      }
      const d: BuiltDeck = json.deck;
      setResult(d);
      await db.builds.put(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setBusy(null);
    }
  }

  if (owned && owned.length === 0) {
    return (
      <div className="mt-8">
        <Notice tone="warn">
          Import your collection first — upgrades come from <a href="/collection" className="text-orange underline">your bulk</a>.
        </Notice>
      </div>
    );
  }

  const mainCount = deck?.cards.filter((c) => c.board === "main").reduce((s, c) => s + c.quantity, 0) ?? 0;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="grid content-start gap-4">
        <Panel title="1 · The deck">
          <div className="flex flex-wrap gap-1">
            {(["url", "paste", "saved"] as Source[]).map((s) => (
              <button key={s} type="button" className="px-chip px-border" aria-pressed={source === s} onClick={() => setSource(s)}>
                {s === "url" ? "Link" : s === "paste" ? "Paste list" : "Saved deck"}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {source === "url" && (
              <>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://moxfield.com/decks/…" aria-label="Deck link" />
                <p className="mt-2 text-[14px] text-muted">Moxfield, Archidekt, MTGGoldfish, Deckstats, TappedOut. Moxfield often blocks automated requests; if it fails, use Moxfield&apos;s Export → Copy and paste the list instead.</p>
              </>
            )}
            {source === "paste" && (
              <TextArea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Commander\n1 Lathliss, Dragon Queen\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n…"} aria-label="Decklist" />
            )}
            {source === "saved" && (
              <Select value={savedId} onChange={(e) => setSavedId(e.target.value)} aria-label="Saved deck">
                <option value="">Choose…</option>
                {!!builds?.length && <optgroup label="Built in Deckbit">{builds.map((b) => <option key={b.id} value={b.id}>{b.name ?? (b.commanders.map((c) => c.name).join(" / ") || "Deck")} · {new Date(b.createdAt).toLocaleDateString()}</option>)}</optgroup>}
                {!!refDecks?.length && <optgroup label="Reference decks">{refDecks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
              </Select>
            )}
          </div>
          <div className="mt-3">
            <Button onClick={load} disabled={!!busy || (source === "url" ? !url.trim() : source === "paste" ? !text.trim() : !savedId)}>Load deck</Button>
          </div>
          {deck && (
            <div className="mt-3 bg-navy-900 px-3 py-2 text-[17px]">
              <div className="text-cream">{deck.name}</div>
              <div className="text-[15px] text-muted">
                {mainCount} cards · {commanders.length ? `commander: ${commanders.join(" / ")}` : "no commander marked"}
              </div>
            </div>
          )}
          {needCommander && needCommander.length > 0 && (
            <div className="mt-3">
              <Label>Which card is the commander?</Label>
              <Select value={commanderPick} onChange={(e) => setCommanderPick(e.target.value)}>
                <option value="">Choose…</option>
                {needCommander.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          )}
        </Panel>

        <Panel title="2 · How hard to upgrade">
          <Label>Target bracket</Label>
          <Select value={bracket} onChange={(e) => setBracket(Number(e.target.value) as BuildOptions["bracket"])}>
            {BRACKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
          <div className="mt-4">
            <Label hint={`${maxSwaps}`}>Max swaps</Label>
            <input type="range" min={1} max={40} value={maxSwaps} onChange={(e) => setMaxSwaps(Number(e.target.value))} className="w-full accent-orange" aria-label="Max swaps" />
          </div>
          <div className="mt-3">
            <Label>Minimum improvement per swap</Label>
            <Select value={minGain} onChange={(e) => setMinGain(Number(e.target.value))}>
              {GAIN_PRESETS.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
            </Select>
          </div>
          {tags.length > 0 && (
            <div className="mt-4">
              <Label hint="optional — lean the upgrade towards one EDHREC build">Build direction</Label>
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 10).map((t) => (
                  <button key={t.slug} type="button" className="px-chip px-border" aria-pressed={tag === t.slug} onClick={() => setTag((x) => (x === t.slug ? undefined : t.slug))} title={`${t.decks.toLocaleString()} decks`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Disclosure summary="Protect & exclude">
          <Label hint="one per line — never cut these">Pet cards</Label>
          <TextArea rows={3} value={protect} onChange={(e) => setProtect(e.target.value)} placeholder="Cards you love even if they're weak" />
          <div className="mt-3">
            <Label hint="one per line — never take these from your bulk">Never use</Label>
            <TextArea rows={3} value={never} onChange={(e) => setNever(e.target.value)} placeholder="Cards promised to other decks" />
          </div>
          <label className="mt-3 flex items-center gap-3 text-[17px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={skipSaved} onChange={(e) => setSkipSaved(e.target.checked)} />
            Don&apos;t take cards used in my saved decks
          </label>
          <label className="mt-2 flex items-center gap-3 text-[17px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={allowLands} onChange={(e) => setAllowLands(e.target.checked)} />
            Allow land upgrades (basics → utility lands)
          </label>
          <label className="mt-2 flex items-center gap-3 text-[17px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={useEdhrec} onChange={(e) => setUseEdhrec(e.target.checked)} />
            Use EDHREC data
          </label>
        </Disclosure>

        <Button onClick={run} disabled={!deck || !!busy || (!!needCommander && !commanderPick)}>Upgrade from my bulk</Button>
        {busy && <Notice>{busy}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      <div className="grid content-start gap-5">
        {result ? (
          <DeckView deck={result} onChange={setResult} />
        ) : (
          <Panel title="How it works">
            <ol className="grid list-decimal gap-2 pl-6 text-[18px] text-cream-dim">
              <li>Every card in the deck and every eligible card in your collection gets a score. The score uses EDHREC data for this commander, the card&apos;s role from Scryfall&apos;s community tags, theme fit, and how well it works with the commander&apos;s text.</li>
              <li>Illegal or off-colour cards are cut first.</li>
              <li>The tool makes the single best swap, then the next best, keeping your ramp, draw, removal and land counts balanced. It stops when nothing beats your current card by the minimum you chose.</li>
              <li>Each swap explains itself in plain English, from the numbers. No AI involved, so friends can use it freely.</li>
            </ol>
          </Panel>
        )}
      </div>
    </div>
  );
}
