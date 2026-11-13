"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { currentPower } from "@/lib/builder/power";
import { db } from "@/lib/db";
import { postJson } from "@/lib/payload";
import { BRACKETS, type BuildOptions, type BuiltDeck, type ReferenceDeck } from "@/lib/types";
import { useCurrency } from "./currency-provider";
import { Button, Chip, Disclosure, Input, Label, Notice, Panel, Select, TextArea } from "./ui";

type Mode = "saved" | "link" | "average";

interface Side {
  deck: BuiltDeck | null;
  label: string;
}

const EXPLAIN_BUILD: BuildOptions = {
  format: "commander", themes: [], includeCards: [], excludeCards: [], referenceDeckIds: [],
  useAI: false, useEdhrec: true, assumeBasics: true, preferCheap: false, mustOwnEverything: false, bracket: 3,
};

/** Score a list we didn't build (a link, a paste, EDHREC's average) the same way as our own decks. */
async function explain(ref: ReferenceDeck, bracket: BuildOptions["bracket"], commanders?: string[]): Promise<BuiltDeck> {
  const json = await postJson<{ deck?: BuiltDeck; needCommander?: string[]; error?: string }>("/api/upgrade", {
    deck: ref,
    commanders,
    owned: [],
    build: { ...EXPLAIN_BUILD, bracket },
    upgrade: { maxSwaps: 0, minGain: 99, protect: [], allowLandSwaps: false },
    explainOnly: true,
  });
  if (json.needCommander) {
    if (!json.needCommander.length) throw new Error("This list doesn't mark a commander and has no legendary creature to use.");
    return explain(ref, bracket, [json.needCommander[0]]);
  }
  if (!json.deck) throw new Error(json.error ?? "Couldn't read that list");
  return { ...json.deck, name: ref.name };
}

export function DeckCompare() {
  const builds = useLiveQuery(() => db.builds.orderBy("createdAt").reverse().toArray(), []);
  const [a, setA] = useState<Side>({ deck: null, label: "" });
  const [b, setB] = useState<Side>({ deck: null, label: "" });
  const [preA, setPreA] = useState<string | undefined>();

  // /saved/compare?a=<deck id> opens with that deck on the left.
  useEffect(() => {
    const t = setTimeout(() => setPreA(new URLSearchParams(window.location.search).get("a") ?? undefined), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SourcePicker slot="A" builds={builds ?? []} other={b.deck} preselect={preA} onLoad={setA} />
        <SourcePicker slot="B" builds={builds ?? []} other={a.deck} onLoad={setB} />
      </div>
      {a.deck && b.deck ? <Comparison a={a} b={b} /> : (
        <p className="text-[17px] text-muted">Pick two decks. Each side can be a saved deck, a Moxfield/Archidekt link or pasted list, or EDHREC&apos;s average deck for a commander at a bracket. Everything is scored with the same power model.</p>
      )}
    </div>
  );
}

function SourcePicker({ slot, builds, other, preselect, onLoad }: { slot: "A" | "B"; builds: BuiltDeck[]; other: BuiltDeck | null; preselect?: string; onLoad: (s: Side) => void }) {
  const [mode, setMode] = useState<Mode>("saved");
  const [savedId, setSavedId] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [commander, setCommander] = useState("");
  const [bracket, setBracket] = useState<BuildOptions["bracket"]>(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);

  // Preselect from the URL once the saved decks are loaded.
  useEffect(() => {
    if (!preselect || savedId) return;
    const d = builds.find((x) => x.id === preselect);
    if (!d) return;
    const t = setTimeout(() => { setSavedId(d.id); onLoad({ deck: d, label: title(d) }); setLoaded(title(d)); }, 0);
    return () => clearTimeout(t);
  }, [preselect, builds, savedId, onLoad]);

  function pickSaved(id: string) {
    setSavedId(id);
    const d = builds.find((x) => x.id === id) ?? null;
    onLoad({ deck: d, label: d ? title(d) : "" });
    setLoaded(d ? title(d) : null);
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      let deck: BuiltDeck;
      let label: string;
      if (mode === "link") {
        const json = await postJson<{ deck?: ReferenceDeck; error?: string }>("/api/scrape", url.trim() ? { url: url.trim() } : { text, name: "Pasted deck" });
        if (!json.deck) throw new Error(json.error ?? "Couldn't load that deck");
        deck = await explain(json.deck, bracket);
        label = json.deck.name;
      } else {
        const name = commander.trim() || other?.commanders[0]?.name || "";
        if (!name) throw new Error("Type a commander, or load the other side first to use its commander.");
        const json = await postJson<{ deck?: ReferenceDeck; bracketUsed?: number; error?: string }>("/api/average-deck", { commander: name, partner: commander.trim() ? undefined : other?.commanders[1]?.name, bracket });
        if (!json.deck) throw new Error(json.error ?? "EDHREC had nothing");
        deck = await explain(json.deck, bracket, json.deck.commanders);
        label = `EDHREC average · ${name}${json.bracketUsed ? ` · bracket ${json.bracketUsed}` : " · all brackets (none for this bracket)"}`;
      }
      onLoad({ deck, label });
      setLoaded(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that deck");
    } finally {
      setBusy(false);
    }
  }

  const otherBracket = other?.options.bracket;
  return (
    <Panel title={`Deck ${slot}`}>
      <div className="flex flex-wrap gap-1">
        <Chip pressed={mode === "saved"} onClick={() => setMode("saved")}>Saved deck</Chip>
        <Chip pressed={mode === "link"} onClick={() => setMode("link")}>Link or paste</Chip>
        <Chip pressed={mode === "average"} onClick={() => { setMode("average"); if (otherBracket) setBracket(otherBracket); }}>EDHREC average</Chip>
      </div>
      <div className="mt-4 grid gap-3">
        {mode === "saved" && (
          <Select value={savedId} onChange={(e) => pickSaved(e.target.value)} aria-label={`Saved deck for ${slot}`}>
            <option value="">Choose a saved deck…</option>
            {builds.map((d) => <option key={d.id} value={d.id}>{title(d)}{d.upgrade ? " (upgrade)" : ""}</option>)}
          </Select>
        )}
        {mode === "link" && (
          <>
            <div>
              <Label hint="Moxfield, Archidekt, MTGGoldfish…">Deck link</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://moxfield.com/decks/…" />
            </div>
            <div>
              <Label hint="used when there's no link">Or paste a list</Label>
              <TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1 Sol Ring\n1 Arcane Signet\n…"} />
            </div>
          </>
        )}
        {mode === "average" && (
          <div>
            <Label hint={other?.commanders[0] ? `blank = ${other.commanders[0].name}` : undefined}>Commander</Label>
            <Input value={commander} onChange={(e) => setCommander(e.target.value)} placeholder={other?.commanders[0]?.name ?? "Commander name"} />
          </div>
        )}
        {mode !== "saved" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Label>{mode === "average" ? "Bracket" : "Score it at bracket"}</Label>
              <Select value={bracket} onChange={(e) => setBracket(Number(e.target.value) as BuildOptions["bracket"])}>
                {BRACKETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </Select>
            </div>
            <Button onClick={load} disabled={busy || (mode === "link" && !url.trim() && !text.trim())}>{busy ? "reading…" : "load"}</Button>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {loaded && <p className="text-[15px] text-muted">Loaded: <span className="text-cream">{loaded}</span></p>}
      </div>
    </Panel>
  );
}

const title = (d: BuiltDeck) => d.name || d.commanders.map((c) => c.name).join(" / ") || "Deck";

const ROLE_ROWS: [string, string][] = [
  ["ramp", "Ramp"], ["draw", "Card draw"], ["removal", "Removal"], ["wipe", "Board wipes"], ["counter", "Counterspells"],
  ["tutor", "Tutors"], ["protection", "Protection"], ["recursion", "Recursion"], ["finisher", "Finishers"], ["creature", "Creatures"], ["synergy", "Synergy"],
];

function Comparison({ a, b }: { a: Side; b: Side }) {
  const { fmt } = useCurrency();
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const A = a.deck!, B = b.deck!;
  const pa = currentPower(A), pb = currentPower(B);
  const factor = (p: typeof pa, label: string) => p.factors.find((f) => f.label === label)?.value ?? "—";

  const overlap = useMemo(() => {
    const names = (d: BuiltDeck) => new Set([...d.commanders, ...d.cards].filter((c) => c.role !== "land" || !/^Basic/.test(c.typeLine)).map((c) => c.name));
    const na = names(A), nb = names(B);
    const shared = [...na].filter((n) => nb.has(n)).sort();
    const onlyA = [...na].filter((n) => !nb.has(n)).sort();
    const onlyB = [...nb].filter((n) => !na.has(n)).sort();
    const have = new Set((owned ?? []).filter((o) => o.card).map((o) => o.card!.name));
    return { shared, onlyA, onlyB, ownA: onlyA.filter((n) => have.has(n)).length, ownB: onlyB.filter((n) => have.has(n)).length, sizeA: na.size, sizeB: nb.size };
  }, [A, B, owned]);

  const num = (d: BuiltDeck, role: string) => d.stats.roles[role] ?? 0;
  const rows: { label: string; a: ReactNode; b: ReactNode; diff?: number }[] = [
    { label: "Power", a: `${pa.score}/10 · ${pa.label}`, b: `${pb.score}/10 · ${pb.label}`, diff: pa.score - pb.score },
    { label: "Bracket (estimated)", a: `~${A.stats.estimatedBracket ?? "?"}`, b: `~${B.stats.estimatedBracket ?? "?"}` },
    { label: "Combos", a: A.combos?.length ?? 0, b: B.combos?.length ?? 0, diff: (A.combos?.length ?? 0) - (B.combos?.length ?? 0) },
    { label: "Game changers", a: A.stats.gameChangers.length, b: B.stats.gameChangers.length, diff: A.stats.gameChangers.length - B.stats.gameChangers.length },
    { label: "Fast mana", a: factor(pa, "Fast mana"), b: factor(pb, "Fast mana") },
    { label: "Cheap interaction", a: factor(pa, "Cheap interaction"), b: factor(pb, "Cheap interaction") },
    { label: "Lands", a: A.stats.lands, b: B.stats.lands, diff: A.stats.lands - B.stats.lands },
    { label: "Average mana value", a: A.stats.avgCmc.toFixed(2), b: B.stats.avgCmc.toFixed(2), diff: Math.round((A.stats.avgCmc - B.stats.avgCmc) * 100) / 100 },
    ...ROLE_ROWS.map(([r, label]) => ({ label, a: num(A, r), b: num(B, r), diff: num(A, r) - num(B, r) })),
    { label: "Price", a: fmt(A.stats.priceUsd, { whole: true }), b: fmt(B.stats.priceUsd, { whole: true }) },
  ];

  return (
    <>
      <Panel tone="orange" title="Side by side">
        <div className="overflow-x-auto">
          <table className="px-table w-full min-w-[560px] text-[17px]">
            <thead>
              <tr>
                <th />
                <th>A · {a.label}</th>
                <th>B · {b.label}</th>
                <th className="text-right">A − B</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="text-cream-dim">{r.label}</td>
                  <td className="text-cream">{r.a}</td>
                  <td className="text-cream">{r.b}</td>
                  <td className={`text-right ${r.diff ? (r.diff > 0 ? "text-orange" : "text-sea-light") : "text-muted"}`}>{r.diff === undefined ? "" : r.diff > 0 ? `+${r.diff}` : r.diff || "="}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Playstyle side="A" d={A} />
          <Playstyle side="B" d={B} />
        </div>
      </Panel>

      <Panel title={`Card overlap: ${overlap.shared.length} shared`}>
        <p className="text-[17px] text-cream-dim">
          {overlap.shared.length} of A&apos;s {overlap.sizeA} non-basic cards are also in B. Of the {overlap.onlyB.length} cards only B plays, you own {overlap.ownB}; of the {overlap.onlyA.length} only A plays, you own {overlap.ownA}.
        </p>
        <div className="mt-4 grid gap-3">
          <Disclosure summary={`Only in A (${overlap.onlyA.length})`}><NameList names={overlap.onlyA} /></Disclosure>
          <Disclosure summary={`Only in B (${overlap.onlyB.length})`}><NameList names={overlap.onlyB} /></Disclosure>
          <Disclosure summary={`In both (${overlap.shared.length})`}><NameList names={overlap.shared} /></Disclosure>
        </div>
      </Panel>
    </>
  );
}

function Playstyle({ side, d }: { side: string; d: BuiltDeck }) {
  return (
    <div className="px-border bg-navy-900 p-3">
      <h3 className="font-pixel mb-2 text-[12px] text-orange">{side}: how it plays</h3>
      <p className="text-[17px] text-cream">{d.primer?.summary ?? "No primer."}</p>
      {d.primer?.winCons.length ? <p className="mt-2 text-[16px] text-cream-dim">Wins with {d.primer.winCons.map((w) => w.name).join("; ")}.</p> : null}
      {d.combos?.length ? <p className="mt-2 text-[15px] text-muted">Combos: {d.combos.slice(0, 4).map((c) => c.cards.join(" + ")).join(" · ")}</p> : null}
    </div>
  );
}

function NameList({ names }: { names: string[] }) {
  if (!names.length) return <p className="text-[16px] text-muted">None.</p>;
  return <ul className="grid gap-x-4 text-[16px] text-cream-dim sm:grid-cols-2 lg:grid-cols-3">{names.map((n) => <li key={n} className="truncate">{n}</li>)}</ul>;
}
