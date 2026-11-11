"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import type { BuiltDeck, Primer } from "@/lib/types";
import { TOME, Sprite } from "./sprites";
import { Button, Disclosure, Notice } from "./ui";

function primerText(deck: BuiltDeck, p: Primer): string {
  const out = [`# ${deck.name ?? deck.commanders.map((c) => c.name).join(" / ")} primer`, "", p.summary, "", "## Game plan", ...p.plan.map((x) => `- ${x}`), "", "## Key cards", ...p.keyCards.map((k) => `- ${k.name}: ${k.why}`), "", "## How it wins", ...p.winCons.map((w) => `- ${w.name}: ${w.how}`)];
  if (deck.combos?.length) {
    out.push("", "## Combos");
    for (const c of deck.combos) out.push(`- ${c.cards.join(" + ")} → ${c.produces.join(", ")}`);
  }
  out.push("", "## Mulligan", ...p.mulligan.map((m) => `- ${m}`), "", "## Turn by turn", ...p.phases.map((ph) => `- ${ph.label}: ${ph.tip} (${ph.cards.join(", ")})`));
  if (p.watchOut.length) out.push("", "## Watch out for", ...p.watchOut.map((w) => `- ${w}`));
  return out.join("\n");
}

export function PrimerView({ deck, onChange }: { deck: BuiltDeck; onChange?: (d: BuiltDeck) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const p = deck.primer;

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/primer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deck }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const updated: BuiltDeck = { ...deck, primer: json.primer, combos: json.combos };
      await db.builds.put(updated);
      onChange?.(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't write the primer");
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return (
      <Disclosure summary="How this deck works">
        <p className="text-[17px] text-cream-dim">This deck was saved before primers existed. BulkBrew can write one from the list, EDHREC and Commander Spellbook data. No AI involved.</p>
        <div className="mt-3"><Button size="sm" onClick={generate} disabled={busy}>{busy ? "Writing…" : "Write a primer"}</Button></div>
        {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
      </Disclosure>
    );
  }

  return (
    <Disclosure
      summary="How this deck works"
      defaultOpen
      aside={
        <Button size="sm" variant="ghost" onClick={async (e) => { e.preventDefault(); await navigator.clipboard.writeText(primerText(deck, p)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "copied" : "copy primer"}
        </Button>
      }
    >
      <div className="flex items-start gap-4">
        <Sprite grid={TOME} scale={3} className="mt-1 shrink-0" />
        <p className="text-[18px] text-cream">{p.summary}</p>
      </div>

      <Section title="Game plan">
        <ul className="grid gap-2">{p.plan.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </Section>

      <Section title="Key cards">
        <ul className="grid gap-1">{p.keyCards.map((k) => <li key={k.name}><span className="text-cream">{k.name}</span> <span className="text-muted">· {k.why}</span></li>)}</ul>
      </Section>

      <Section title="How it wins">
        <ul className="grid gap-1">{p.winCons.map((w) => <li key={w.name}><span className="text-orange">{w.name}</span> <span className="text-cream-dim">{w.how}</span></li>)}</ul>
      </Section>

      {deck.combos && deck.combos.some((c) => c.steps) && (
        <Section title="Combo lines">
          <ul className="grid gap-3">
            {deck.combos.filter((c) => c.steps).slice(0, 5).map((c) => (
              <li key={c.id} className="bg-navy-900 px-3 py-2">
                <div className="text-cream">{c.cards.join(" + ")}</div>
                <div className="text-[14px] text-gold">{c.produces.join(" · ")}</div>
                {c.requires && <div className="mt-1 text-[14px] text-muted">Needs: {c.requires}</div>}
                <ol className="mt-2 grid list-decimal gap-1 pl-6 text-[15px] text-cream-dim">
                  {c.steps!.split(/\r?\n+/).filter(Boolean).map((s, i) => <li key={i}>{s.replace(/^\d+[.)]\s*/, "")}</li>)}
                </ol>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Mulligan">
        <ul className="grid gap-1">{p.mulligan.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </Section>

      <Section title="Turn by turn">
        <ul className="grid gap-2">
          {p.phases.map((ph) => (
            <li key={ph.label}>
              <span className="font-pixel text-[13px] text-orange">{ph.label}</span>
              <div className="text-cream-dim">{ph.tip}</div>
              {ph.cards.length > 0 && <div className="text-[15px] text-muted">Look for: {ph.cards.join(", ")}</div>}
            </li>
          ))}
        </ul>
      </Section>

      {p.watchOut.length > 0 && (
        <Section title="Watch out for">
          <ul className="grid gap-1 text-gold">{p.watchOut.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Section>
      )}
      <p className="mt-4 text-[14px] text-muted">Written by BulkBrew from the decklist, EDHREC and Commander Spellbook. No AI involved.</p>
    </Disclosure>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 text-[17px] text-cream-dim">
      <h3 className="font-pixel mb-2 text-[13px] text-orange">{title}</h3>
      {children}
    </div>
  );
}
