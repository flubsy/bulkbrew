"use client";

import { useMemo, useRef, useState } from "react";
import type { CommanderOption } from "@/lib/builder/commanders";
import { currentPower } from "@/lib/builder/power";
import { STAPLE_RANK } from "@/lib/collection";
import { db } from "@/lib/db";
import { deckToText } from "@/lib/export";
import { runBuild } from "@/lib/run-build";
import type { BuildOptions, BuiltDeck, CardData } from "@/lib/types";
import { useCurrency } from "./currency-provider";
import { Button, Notice, Panel, Progress, Select } from "./ui";

interface Result { name: string; deck?: BuiltDeck; error?: string; key: number }

/** Precise ranking key: the 1–10 score first, then the uncapped points behind it, then combos. */
function rankKey(d: BuiltDeck): number {
  const p = currentPower(d);
  const raw = p.factors.reduce((s, f) => s + f.points, 0);
  return p.score * 1000 + raw * 10 + (d.combos?.length ?? 0);
}

/**
 * "Fuck my shit up fam": build the strongest candidates among the commanders you own, at the
 * chosen bracket, and rank the finished decks by BulkBrew's power model. Candidates are picked by
 * how much strong, on-colour material you own for each (game changers and EDHREC staples) plus
 * how established the commander is on EDHREC, so it doesn't build all 200 of your legends.
 */
export function PowerGauntlet({ commanders, cards, bracket, decksOf, base, onOpen, onClose }: {
  commanders: CommanderOption[];
  cards: CardData[];
  bracket: BuildOptions["bracket"];
  decksOf: (c: CommanderOption) => number;
  base: BuildOptions;
  onOpen: (d: BuiltDeck) => void;
  onClose: () => void;
}) {
  const [depth, setDepth] = useState(12);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const stop = useRef(false);
  const { fmt } = useCurrency();

  const ranked = useMemo(() => {
    const unique = new Map<string, CardData>();
    for (const c of cards) if (!unique.has(c.name)) unique.set(c.name, c);
    const strong = [...unique.values()]
      .filter((c) => !/Land/.test(c.typeLine.split("//")[0]) || c.gameChanger)
      .map((c) => ({ ci: c.colorIdentity, w: c.gameChanger ? 4 : c.edhrecRank == null ? 0 : c.edhrecRank <= 100 ? 3 : c.edhrecRank <= STAPLE_RANK ? 2 : c.edhrecRank <= 1500 ? 0.5 : 0 }))
      .filter((x) => x.w > 0);
    return commanders
      .map((cmd) => {
        const ci = new Set(cmd.ci);
        const material = strong.reduce((s, x) => (x.ci.every((k) => ci.has(k)) ? s + x.w : s), 0);
        return { cmd, pre: material + Math.log10(decksOf(cmd) + 1) * 4 };
      })
      .sort((a, b) => b.pre - a.pre);
  }, [commanders, cards, decksOf]);

  async function run() {
    const field = ranked.slice(0, depth).map((r) => r.cmd);
    stop.current = false;
    setRunning(true);
    setDone(0);
    setResults([]);
    const out: Result[] = [];
    let next = 0;
    const worker = async () => {
      while (!stop.current && next < field.length) {
        const cmd = field[next++];
        try {
          const { deck } = await runBuild({ ...base, bracket, commander: cmd.name, partner: undefined, edhrecTag: undefined, themes: [], tribe: undefined }, { save: false });
          out.push({ name: cmd.name, deck, key: rankKey(deck) });
        } catch (e) {
          out.push({ name: cmd.name, error: e instanceof Error ? e.message : "build failed", key: -1 });
        }
        setResults([...out].sort((a, b) => b.key - a.key));
        setDone((n) => n + 1);
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(false);
    const best = out.filter((r) => r.deck).sort((a, b) => b.key - a.key)[0];
    if (best?.deck) onOpen(best.deck);
  }

  async function save(d: BuiltDeck) {
    await db.builds.put(d);
    setSaved((s) => new Set(s).add(d.id));
  }

  const best = results.find((r) => r.deck);

  return (
    <Panel tone="gold" title="Fuck my shit up fam">
      <p className="text-[17px] text-cream-dim">
        Builds your {Math.min(depth, ranked.length)} most dangerous commanders at bracket {bracket} and ranks the finished decks by BulkBrew&apos;s power model
        (fast mana, tutors, combos, interaction, curve). Contenders are picked by how many game changers and EDHREC staples you own in their colours.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[16px] text-cream-dim">
          Contenders
          <Select value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={running} className="!w-24" aria-label="How many commanders to build">
            {[6, 12, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </label>
        {running
          ? <Button size="sm" variant="ghost" onClick={() => { stop.current = true; }}>stop after these</Button>
          : <Button size="sm" onClick={run} disabled={!ranked.length}>{results.length ? "run it again" : "do it"}</Button>}
        <Button size="sm" variant="ghost" onClick={onClose} disabled={running}>close</Button>
      </div>
      {running && <div className="mt-4"><Progress value={done} max={Math.min(depth, ranked.length)} label={`Building ${done} of ${Math.min(depth, ranked.length)}…`} /></div>}

      {results.length > 0 && (
        <ol className="mt-4 grid gap-[2px]">
          {results.map((r, i) => {
            const p = r.deck ? currentPower(r.deck) : null;
            return (
              <li key={r.name} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 text-[17px] ${i === 0 && r.deck ? "bg-navy-900" : "hover:bg-navy-600"}`}>
                <span className="font-pixel w-6 text-[12px] text-muted">{i + 1}</span>
                <span className={`min-w-0 flex-1 truncate ${i === 0 && r.deck ? "text-orange" : "text-cream"}`}>{r.name}</span>
                {r.deck && p ? (
                  <>
                    <span className="text-cream">{p.score}/10</span>
                    <span className="text-[15px] text-muted">bracket ~{r.deck.stats.estimatedBracket} · {r.deck.combos?.length ?? 0} combos · {fmt(r.deck.stats.priceUsd, { whole: true })}</span>
                    <Button size="sm" variant="ghost" onClick={() => onOpen(r.deck!)}>view</Button>
                    <Button size="sm" variant="ghost" onClick={() => save(r.deck!)} disabled={saved.has(r.deck.id)}>{saved.has(r.deck.id) ? "saved" : "save"}</Button>
                  </>
                ) : <span className="text-[15px] text-orange">{r.error}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {!running && best?.deck && (
        <div className="mt-4">
          <Notice>
            Second opinions: copy the winner&apos;s list and paste it into{" "}
            <a href="https://edhpowerlevel.com" target="_blank" rel="noreferrer" className="text-orange underline">edhpowerlevel.com</a> or{" "}
            <a href="https://commandersalt.com" target="_blank" rel="noreferrer" className="text-orange underline">commandersalt.com</a>. Neither offers an API, so BulkBrew can&apos;t ask them directly.{" "}
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(deckToText(best.deck!))}>copy winner</Button>
          </Notice>
        </div>
      )}
    </Panel>
  );
}
