"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { creatureTypes } from "@/lib/builder/classify";
import { suggestCommanders } from "@/lib/builder/commanders";
import { db } from "@/lib/db";
import { packCollection, postJson } from "@/lib/payload";
import { BRACKETS, COLOR_COMBOS, FORMATS, THEMES, type BuildOptions, type BuiltDeck, type Color } from "@/lib/types";
import { CardPreviewProvider } from "./card-preview";
import { CommanderPicker } from "./commander-picker";
import { DeckView } from "./deck-view";
import { ManaSymbol } from "./mana";
import { Button, Chip, Disclosure, Input, Label, Notice, Panel, Select, TextArea } from "./ui";

const DEFAULTS: BuildOptions = {
  format: "commander",
  themes: [],
  includeCards: [],
  excludeCards: [],
  referenceDeckIds: [],
  useAI: false,
  useEdhrec: true,
  assumeBasics: true,
  preferCheap: false,
  mustOwnEverything: true,
  bracket: 3,
};

const STORAGE_KEY = "deckbit.buildOptions";

export function DeckBuilder() {
  return (
    <CardPreviewProvider>
      <DeckBuilderInner />
    </CardPreviewProvider>
  );
}

function DeckBuilderInner() {
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const refs = useLiveQuery(() => db.refDecks.toArray(), []);
  const [opts, setOpts] = useState<BuildOptions>(DEFAULTS);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<BuiltDeck | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [setQuery, setSetQuery] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<BuildOptions> & { include?: string; exclude?: string };
          setOpts({ ...DEFAULTS, ...saved });
          setInclude(saved.include ?? "");
          setExclude(saved.exclude ?? "");
        }
      } catch { /* ignore */ }
      setRestored(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!restored) return; // never overwrite storage with defaults before the restore has run
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...opts, include, exclude })); } catch { /* ignore */ }
  }, [opts, include, exclude, restored]);

  const meta = FORMATS.find((f) => f.id === opts.format)!;
  const isEdh = meta.singleton && meta.size === 100;
  const enriched = useMemo(() => (owned ?? []).filter((c) => c.card), [owned]);
  const cards = useMemo(() => enriched.map((c) => c.card!), [enriched]);

  const commanders = useMemo(() => (isEdh ? suggestCommanders(cards, opts.format, [], undefined) : []), [cards, isEdh, opts.format]);

  const typeCounts = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of enriched) for (const t of creatureTypes(c.card!.typeLine)) count.set(t, (count.get(t) ?? 0) + c.quantity);
    return count;
  }, [enriched]);
  const tribes = useMemo(() => [...typeCounts.entries()].filter(([, n]) => n >= 6).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n })), [typeCounts]);
  const knownTypes = useMemo(() => [...typeCounts.keys()], [typeCounts]);

  const sets = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    for (const c of enriched) {
      const code = c.card!.setCode;
      const e = m.get(code);
      if (e) e.n += c.quantity;
      else m.set(code, { code, name: c.card!.setName, n: c.quantity });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [enriched]);
  const setMatches = useMemo(() => {
    const q = setQuery.trim().toLowerCase();
    return sets.filter((s) => !q || s.code.includes(q) || s.name.toLowerCase().includes(q)).slice(0, 60);
  }, [sets, setQuery]);

  const selectedCommander = commanders.find((c) => c.name === opts.commander);
  const partnerable = useMemo(() => {
    if (!selectedCommander) return [];
    const self = cards.find((c) => c.name === selectedCommander.name);
    if (!self || !/partner|friends forever|choose a background|doctor's companion/i.test(self.oracleText)) return [];
    return commanders.filter((c) => c.name !== selectedCommander.name);
  }, [selectedCommander, cards, commanders]);

  const toggle = <K extends "themes" | "colors" | "allowedSets" | "referenceDeckIds">(key: K, v: string) =>
    setOpts((o) => {
      const cur = (o[key] ?? []) as string[];
      return { ...o, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  async function build(override?: BuildOptions) {
    setError(null);
    setDeck(null);
    if (!enriched.length) { setError("Import your collection first."); return; }
    const base = override ?? opts;
    const options: BuildOptions = {
      ...base,
      includeCards: include.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
      excludeCards: exclude.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
      commander: isEdh ? base.commander : undefined,
      partner: isEdh ? base.partner : undefined,
      bracket: base.format === "commander" ? base.bracket : undefined,
    };
    const selectedRefs = (refs ?? []).filter((r) => options.referenceDeckIds.includes(r.id));
    setBusy(options.useAI ? "Scoring your collection, pulling EDHREC, then asking Claude to tune the list… (30–120s)" : "Scoring your collection against EDHREC and checking combos…");
    try {
      const json = await postJson<{ deck: BuiltDeck; aiAvailable: boolean }>("/api/build", { options, owned: packCollection(enriched, options.format), refs: selectedRefs });
      const built: BuiltDeck = json.deck;
      setAiAvailable(json.aiAvailable);
      setDeck(built);
      await db.builds.put(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBusy(null);
    }
  }

  if (owned && owned.length === 0) {
    return (
      <div className="mt-8">
        <Notice tone="warn">
          Your collection is empty. <a href="/collection" className="text-orange underline">Import it</a> first — the builder only uses cards you own.
        </Notice>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* ---------------- Options ---------------- */}
      <div className="grid content-start gap-4">
        <Panel title="Format">
          <Select value={opts.format} onChange={(e) => setOpts((o) => ({ ...o, format: e.target.value as BuildOptions["format"], commander: undefined, partner: undefined }))} aria-label="Format">
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </Select>

          {!isEdh && (
            <div className="mt-4">
              <Label hint="leave empty for any">Colours</Label>
              <div className="flex flex-wrap gap-1">
                {(["W", "U", "B", "R", "G"] as Color[]).map((c) => (
                  <Chip key={c} pressed={(opts.colors ?? []).includes(c)} onClick={() => toggle("colors", c)} title={COLOR_COMBOS[c]}>
                    <ManaSymbol sym={c} size={16} /> {COLOR_COMBOS[c].replace("Mono-", "")}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {opts.format === "commander" && (
            <div className="mt-4">
              <Label>Bracket</Label>
              <Select value={opts.bracket ?? 3} onChange={(e) => setOpts((o) => ({ ...o, bracket: Number(e.target.value) as BuildOptions["bracket"] }))}>
                {BRACKETS.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </Select>
              <p className="mt-2 text-[16px] text-muted">{BRACKETS.find((b) => b.id === (opts.bracket ?? 3))?.blurb}</p>
            </div>
          )}
        </Panel>

        <Panel title="Theme / gimmick">
          <div className="flex flex-wrap gap-1">
            {THEMES.map((t) => (
              <Chip key={t.id} pressed={opts.themes.includes(t.id)} onClick={() => toggle("themes", t.id)}>
                {t.label}
              </Chip>
            ))}
          </div>
          {opts.themes.includes("tribal") && (
            <div className="mt-4">
              <Label hint="types with 6+ cards in your collection">Creature type</Label>
              <Select value={opts.tribe ?? ""} onChange={(e) => setOpts((o) => ({ ...o, tribe: e.target.value || undefined }))}>
                <option value="">{opts.commander ? "auto from commander" : "choose…"}</option>
                {tribes.map(({ t, n }) => (
                  <option key={t} value={t}>{t} ({n})</option>
                ))}
              </Select>
            </div>
          )}
        </Panel>

        {isEdh && (
          <>
            <CommanderPicker cards={cards} opts={opts} setOpts={setOpts} knownTypes={knownTypes} />
            {partnerable.length > 0 && (
              <Panel title="Partner / background">
                <Select value={opts.partner ?? ""} onChange={(e) => setOpts((o) => ({ ...o, partner: e.target.value || undefined }))} aria-label="Partner">
                  <option value="">none</option>
                  {partnerable.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.combo}</option>
                  ))}
                </Select>
              </Panel>
            )}
          </>
        )}

        <Panel title="Budget & price">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label hint="USD">Deck max</Label>
              <Input type="number" min={0} step={10} placeholder="any" value={opts.budget ?? ""} onChange={(e) => setOpts((o) => ({ ...o, budget: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div>
              <Label hint="USD">Per card max</Label>
              <Input type="number" min={0} step={1} placeholder="any" value={opts.maxCardPrice ?? ""} onChange={(e) => setOpts((o) => ({ ...o, maxCardPrice: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-3 text-[18px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={opts.preferCheap} onChange={(e) => setOpts((o) => ({ ...o, preferCheap: e.target.checked }))} />
            Prefer cheaper cards on ties
          </label>
        </Panel>

        <Disclosure summary="Filters" aside={<span className="text-[15px] text-muted">{summarise(opts, refs?.length ?? 0)}</span>}>
          <Label hint={opts.allowedSets?.length ? `${opts.allowedSets.length} selected` : "any set"}>Only use cards from these sets</Label>
          <Input placeholder="Search sets…" value={setQuery} onChange={(e) => setSetQuery(e.target.value)} aria-label="Search sets" />
          <div className="mt-2 flex max-h-36 flex-wrap gap-1 overflow-y-auto">
            {setMatches.map((s) => (
              <Chip key={s.code} pressed={(opts.allowedSets ?? []).includes(s.code)} onClick={() => toggle("allowedSets", s.code)} title={`${s.name} · ${s.n} cards`}>
                {s.code.toUpperCase()}
              </Chip>
            ))}
          </div>
          {!!opts.allowedSets?.length && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpts((o) => ({ ...o, allowedSets: [] }))}>
              clear sets
            </Button>
          )}

          <div className="mt-5">
            <Label hint="one per line">Must include</Label>
            <TextArea rows={2} value={include} onChange={(e) => setInclude(e.target.value)} placeholder="Sol Ring" />
          </div>
          <div className="mt-3">
            <Label hint="one per line">Never use</Label>
            <TextArea rows={2} value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="Cards you want to keep in another deck" />
          </div>

          <div className="mt-5">
            <Label hint={refs?.length ? "" : "none saved"}>Reference decks</Label>
            {!refs?.length && (
              <p className="text-[16px] text-muted">
                <a href="/decks" className="text-orange underline">Add some</a> to teach the engine an archetype.
              </p>
            )}
            <ul className="grid gap-2">
              {refs?.map((r) => (
                <li key={r.id}>
                  <label className="flex items-start gap-3 text-[17px]">
                    <input type="checkbox" className="mt-1 h-5 w-5 accent-orange" checked={opts.referenceDeckIds.includes(r.id)} onChange={() => toggle("referenceDeckIds", r.id)} />
                    <span>
                      {r.name}
                      <span className="block text-[14px] text-muted">{r.source}{r.commanders.length ? ` · ${r.commanders.join(" / ")}` : ""}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>

        <Disclosure summary="Engine">
          <label className="flex items-center gap-3 text-[18px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={opts.useEdhrec} onChange={(e) => setOpts((o) => ({ ...o, useEdhrec: e.target.checked }))} />
            Use EDHREC recommendations
          </label>
          <label className="mt-2 flex items-center gap-3 text-[18px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={opts.useAI} onChange={(e) => setOpts((o) => ({ ...o, useAI: e.target.checked }))} />
            Refine with Claude (optional, uses AI credits)
          </label>
          <label className="mt-2 flex items-center gap-3 text-[18px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={opts.assumeBasics} onChange={(e) => setOpts((o) => ({ ...o, assumeBasics: e.target.checked }))} />
            Assume unlimited basic lands
          </label>
          <p className="mt-2 text-[15px] text-muted">Builds are rules-based by default: your collection, EDHREC data, Scryfall card roles and Commander Spellbook combos. The Claude pass only proposes swaps on top.</p>
          {aiAvailable === false && <p className="mt-2 text-[15px] text-gold">AI is off on this server, so the Claude pass is skipped.</p>}
        </Disclosure>

        <Button onClick={() => build()} disabled={!!busy}>
          {busy ? "Building…" : "Build deck"}
        </Button>
        {busy && <Notice>{busy}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      {/* ---------------- Result ---------------- */}
      <div className="grid content-start gap-5">
        {deck ? (
          <DeckView deck={deck} onChange={setDeck} />
        ) : (
          <Panel title="Result">
            <p className="text-[19px] text-cream-dim">
              Set your options and hit <span className="text-orange">Build deck</span>. You&apos;ll get the list with a mana curve, power rating, the reasoning behind each pick, a bench of alternatives you own, and an EDHREC wishlist of what you don&apos;t.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function summarise(o: BuildOptions, refCount: number) {
  const parts: string[] = [];
  if (o.allowedSets?.length) parts.push(`${o.allowedSets.length} sets`);
  if (o.referenceDeckIds.length) parts.push(`${o.referenceDeckIds.length}/${refCount} refs`);
  if (o.includeCards.length) parts.push(`${o.includeCards.length} must`);
  if (o.excludeCards.length) parts.push(`${o.excludeCards.length} never`);
  return parts.join(" · ") || "none";
}
