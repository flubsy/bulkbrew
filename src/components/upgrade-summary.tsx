"use client";

import { useState } from "react";
import type { BuiltDeck, Combo, Swap, UpgradeSummary } from "@/lib/types";
import { previewProps, useCardPreview } from "./card-preview";
import { ManaCost } from "./mana";
import { Button, Disclosure, Panel } from "./ui";

const ROLE_LABEL: Record<string, string> = {
  creature: "Creatures", ramp: "Ramp", draw: "Draw", removal: "Removal", wipe: "Wipes", counter: "Counters",
  tutor: "Tutors", protection: "Protection", recursion: "Recursion", finisher: "Finishers", utility: "Utility", land: "Lands",
};

/** Plain-text swap summary for Discord / notes / Moxfield comments. */
export function swapSummaryText(deck: BuiltDeck): string {
  const u = deck.upgrade!;
  const lines = [`${u.originalName}: ${u.swaps.length} swaps from my collection (BulkBrew)`, ""];
  for (const c of u.forcedCuts) lines.push(`CUT ${c.name}: ${c.why}`);
  for (const s of u.swaps) {
    lines.push(`OUT ${s.out.name}  →  IN ${s.in.name}`);
    lines.push(`  + ${s.whyIn.map((r) => r.text).join(" ")}`);
    lines.push(`  − ${s.whyOut.map((r) => r.text).join(" ")}`);
  }
  lines.push("");
  lines.push(`Avg mana value ${u.before.avgCmc} → ${u.after.avgCmc}`);
  if (u.before.power && u.after.power) lines.push(`Power ${u.before.power.score}/10 → ${u.after.power.score}/10`);
  lines.push(`EDHREC match ${u.before.edhrecMatch}% → ${u.after.edhrecMatch}%`);
  return lines.join("\n");
}

/** Moxfield/Archidekt-friendly lists of just the changes. */
function changesText(u: UpgradeSummary, side: "in" | "out") {
  const names = side === "in" ? u.swaps.map((s) => s.in.name) : [...u.swaps.map((s) => s.out.name), ...u.forcedCuts.map((c) => c.name)];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, q]) => `${q} ${n}`).join("\n");
}

export function UpgradeSummaryView({ deck }: { deck: BuiltDeck }) {
  const u = deck.upgrade!;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };
  const roles = [...new Set([...Object.keys(u.before.roles), ...Object.keys(u.after.roles)])].filter((r) => ROLE_LABEL[r]);

  return (
    <>
      <Panel
        tone="orange"
        title={`Swap summary · ${u.swaps.length} change${u.swaps.length === 1 ? "" : "s"}`}
        aside={
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => copy("sum", swapSummaryText(deck))}>{copied === "sum" ? "copied" : "copy summary"}</Button>
            <Button size="sm" variant="ghost" onClick={() => copy("in", changesText(u, "in"))}>{copied === "in" ? "copied" : "copy ins"}</Button>
            <Button size="sm" variant="ghost" onClick={() => copy("out", changesText(u, "out"))}>{copied === "out" ? "copied" : "copy outs"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Delta label="Power" before={u.before.power ? `${u.before.power.score}` : "–"} after={u.after.power ? `${u.after.power.score}` : "–"} suffix="/10" better={(u.after.power?.score ?? 0) >= (u.before.power?.score ?? 0)} />
          <Delta label="Avg mana value" before={u.before.avgCmc.toFixed(2)} after={u.after.avgCmc.toFixed(2)} better={u.after.avgCmc <= u.before.avgCmc} />
          <Delta label="EDHREC match" before={`${u.before.edhrecMatch}`} after={`${u.after.edhrecMatch}`} suffix="%" better={u.after.edhrecMatch >= u.before.edhrecMatch} />
          <Delta label="Swaps" before="" after={`${u.swaps.length}`} better />
        </div>
        {roles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[16px] text-cream-dim">
            {roles.map((r) => {
              const b = u.before.roles[r] ?? 0;
              const a = u.after.roles[r] ?? 0;
              return (
                <span key={r}>
                  {ROLE_LABEL[r]} {b === a ? <span className="text-cream">{a}</span> : <><span className="text-muted">{b}</span> → <span className="text-orange">{a}</span></>}
                </span>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[15px] text-muted">
          Every reason below is worked out from EDHREC numbers, Scryfall card roles and your deck&apos;s own stats. No AI involved. To apply in Moxfield: open the deck, remove the &ldquo;outs&rdquo;, then Bulk Edit → paste the &ldquo;ins&rdquo;.
        </p>
      </Panel>

      {u.forcedCuts.length > 0 && (
        <Panel title="Had to cut">
          <ul className="grid gap-1 text-[17px]">
            {u.forcedCuts.map((c) => (
              <li key={c.name}><span className="text-orange">{c.name}</span> <span className="text-cream-dim">{c.why}</span></li>
            ))}
          </ul>
        </Panel>
      )}

      {u.swaps.length === 0 ? (
        <Panel title="No swaps">
          <p className="text-[18px] text-cream-dim">Nothing in your collection beats what&apos;s already in the list by enough to be worth the change. Lower the &ldquo;minimum improvement&rdquo; to see marginal swaps.</p>
        </Panel>
      ) : (
        <ol className="grid gap-3">
          {u.swaps.map((s, i) => (
            <SwapCard key={i} n={i + 1} s={s} />
          ))}
        </ol>
      )}

      {u.comboSuggestions.length > 0 && (
        <Disclosure summary={`Combos you could complete from your collection (${u.comboSuggestions.length})`}>
          <p className="mb-3 text-[16px] text-cream-dim">From Commander Spellbook. These use cards you own; adding them raises the deck&apos;s bracket, so they aren&apos;t swapped in automatically.</p>
          <ComboList combos={u.comboSuggestions} showMissing />
        </Disclosure>
      )}
    </>
  );
}

function SwapCard({ n, s }: { n: number; s: Swap }) {
  const preview = useCardPreview();
  return (
    <li className="px-border px-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-pixel text-[12px] text-muted">Swap {n}</span>
        <span className="font-pixel text-[12px] text-orange" title="How many points better the incoming card scores than the one it replaces (EDHREC play rate, synergy, theme fit, role, curve).">+{Math.round(s.gain)} pts</span>
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div className="bg-navy-900 p-3">
          <div className="px-label !mb-1">Out</div>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-[19px] text-cream-dim line-through decoration-orange/60" {...previewProps(preview, s.out.imageNormal ?? s.out.imageSmall, s.out.name)}>
            <span className="truncate">{s.out.name}</span>
            <ManaCost cost={s.out.manaCost} size={14} />
          </button>
          <ul className="mt-2 grid gap-1 text-[15px] text-muted">
            {s.whyOut.map((r, i) => <li key={i}>− {r.text}</li>)}
          </ul>
        </div>
        <div className="bg-navy-900 p-3">
          <div className="px-label !mb-1 !text-orange">In</div>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-[19px] text-cream" {...previewProps(preview, s.in.imageNormal ?? s.in.imageSmall, s.in.name)}>
            <span className="truncate">{s.in.name}</span>
            <ManaCost cost={s.in.manaCost} size={14} />
          </button>
          <ul className="mt-2 grid gap-1 text-[15px] text-cream-dim">
            {s.whyIn.map((r, i) => <li key={i}>+ {r.text}</li>)}
          </ul>
        </div>
      </div>
    </li>
  );
}

function Delta({ label, before, after, suffix = "", better }: { label: string; before: string; after: string; suffix?: string; better: boolean }) {
  return (
    <div className="bg-navy-900 px-3 py-2">
      <div className="px-label mb-1">{label}</div>
      <div className="font-pixel text-[17px]">
        {before && before !== after && <span className="text-muted">{before}{suffix} → </span>}
        <span className={before && before !== after ? (better ? "text-green" : "text-gold") : "text-cream"}>{after}{suffix}</span>
      </div>
    </div>
  );
}

export function ComboList({ combos, showMissing = false }: { combos: Combo[]; showMissing?: boolean }) {
  return (
    <ul className="grid gap-2">
      {combos.map((c) => (
        <li key={c.id} className="bg-navy-900 px-3 py-2 text-[16px]">
          <div className="text-cream">
            {c.cards.map((n, i) => (
              <span key={n}>
                {i > 0 && <span className="text-muted"> + </span>}
                <span className={showMissing && c.missing.includes(n) ? "text-orange" : ""}>{n}</span>
              </span>
            ))}
          </div>
          <div className="mt-1 text-[14px] text-cream-dim">
            {c.produces.join(" · ")}
            {c.bracketTag && <span className="ml-2 font-pixel text-[11px] text-gold">{c.bracketTag}</span>}
            {showMissing && c.missing.length > 0 && <span className="ml-2 text-orange">needs {c.missing.join(" + ")} (owned)</span>}
            <a href={c.url} target="_blank" rel="noreferrer" className="ml-2 text-sea-light underline">how it works</a>
          </div>
        </li>
      ))}
    </ul>
  );
}
