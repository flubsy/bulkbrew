"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { deckToCsv, deckToText, download } from "@/lib/export";
import { BRACKETS, FORMATS, type BuiltDeck, type Color, type DeckEntry, type EdhrecCard, type Role } from "@/lib/types";
import { previewProps, useCardPreview } from "./card-preview";
import { ManaCost, ManaSymbol } from "./mana";
import { PowerMeter } from "./power-meter";
import { currentPower } from "@/lib/builder/power";
import { PrimerView } from "./primer-view";
import { ComboList, UpgradeSummaryView } from "./upgrade-summary";
import { Button, Disclosure, Input, Notice, Panel } from "./ui";
import { useCurrency } from "./currency-provider";
import { SampleHand } from "./sample-hand";
import { BuyLinks } from "./buy-links";
import { shareDeck, sharingAvailable, shareUrl } from "@/lib/share";
import { OwnedSearch, ReEvaluatePanel, useDeckDraft, useReEvaluate } from "./deck-edit";
import { GLYPH_CROSS, GLYPH_PLUS, Sprite } from "./sprites";
import { usePrintings } from "./use-printings";

const ROLE_LABEL: Record<Role, string> = {
  commander: "Commander",
  creature: "Creatures",
  synergy: "Synergy",
  ramp: "Ramp",
  draw: "Card draw",
  removal: "Removal",
  wipe: "Board wipes",
  counter: "Counterspells",
  tutor: "Tutors",
  protection: "Protection",
  recursion: "Recursion",
  finisher: "Finishers",
  utility: "Utility",
  land: "Lands",
};

const ROLE_ORDER: Role[] = ["creature", "synergy", "ramp", "draw", "removal", "wipe", "counter", "tutor", "protection", "recursion", "finisher", "utility", "land"];

export function DeckView({ deck, onChange, readOnly = false }: { deck: BuiltDeck; onChange?: (d: BuiltDeck) => void; readOnly?: boolean }) {
  const preview = useCardPreview();
  const { fmt } = useCurrency();
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState(deck.name ?? "");
  const [share, setShare] = useState<{ busy?: boolean; url?: string; error?: string; copied?: boolean }>({});
  const canShare = !readOnly && sharingAvailable();
  const meta = FORMATS.find((f) => f.id === deck.options.format)!;
  const printings = usePrintings();
  const printing = readOnly ? undefined : printings.lookup;
  const edit = useDeckDraft(deck, (d) => onChange?.(d), !readOnly);
  const reeval = useReEvaluate(deck);
  const editing = !!edit.draft;
  const listCards = edit.draft?.cards ?? deck.cards;
  const alternatives = edit.draft?.alternatives ?? deck.alternatives ?? [];
  const listCount = listCards.reduce((s, c) => s + c.quantity, 0) + deck.commanders.length;
  const groups = ROLE_ORDER.map((r) => ({ role: r, cards: listCards.filter((c) => c.role === r) })).filter((g) => g.cards.length);
  const maxCurve = Math.max(1, ...deck.stats.curve);
  const pipTotal = Object.values(deck.stats.pips).reduce((a, b) => a + b, 0) || 1;
  const title = deck.name || deck.commanders.map((c) => c.name).join(" / ") || meta.label;

  async function copy(kind: "text" | "arena") {
    await navigator.clipboard.writeText(deckToText(deck, printing));
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  async function saveName() {
    const updated = { ...deck, name: name.trim() || undefined };
    await db.builds.put(updated);
    onChange?.(updated);
  }

  async function doShare() {
    setShare({ busy: true });
    try {
      const id = await shareDeck(deck);
      const url = shareUrl(id);
      if (id !== deck.shareId) {
        if (await db.builds.get(deck.id)) await db.builds.update(deck.id, { shareId: id });
        onChange?.({ ...deck, shareId: id });
      }
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* not allowed: the link is shown instead */ }
      setShare({ url, copied });
    } catch (e) {
      setShare({ error: e instanceof Error ? e.message : "Couldn't share" });
    }
  }

  async function toggleBuilt() {
    const updated = { ...deck, inUse: !deck.inUse || undefined };
    await db.builds.put(updated);
    onChange?.(updated);
  }

  async function addWish(w: EdhrecCard) {
    await db.wishlist.put({ name: w.name, addedAt: Date.now(), forDeck: title, note: w.label });
  }

  const power = deck.cards.length ? currentPower(deck) : null;

  return (
    <>
      <Panel
        tone="orange"
        title={title}
        aside={
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => copy("text")}>{copied === "text" ? "copied" : "copy list"}</Button>
            <Button size="sm" variant="ghost" onClick={() => download(`${slug(title)}.txt`, deckToText(deck, printing))}>.txt</Button>
            <Button size="sm" variant="ghost" onClick={() => download(`${slug(title)}.csv`, deckToCsv(deck, printing), "text/csv")}>.csv</Button>
            {canShare && <Button size="sm" variant="ghost" onClick={doShare} disabled={share.busy}>{share.busy ? "sharing…" : deck.shareId ? "share link" : "share"}</Button>}
            {!readOnly && deck.cards.length > 0 && <Button size="sm" variant="ghost" onClick={editing ? edit.discard : edit.start} aria-pressed={editing}>{editing ? "stop editing" : "edit"}</Button>}
            {!readOnly && deck.commanders.length > 0 && <Button size="sm" variant="ghost" onClick={reeval.run} disabled={reeval.busy || editing} title="Check your collection for cards that would improve this deck now">{reeval.busy ? "re-evaluating…" : "re-evaluate"}</Button>}
            {!readOnly && <a href={`/saved/compare?a=${encodeURIComponent(deck.id)}`} className="px-btn px-btn-ghost px-btn-sm inline-block" title="Compare with another deck, a Moxfield/Archidekt list, or EDHREC's average">compare</a>}
            {!readOnly && <Button size="sm" variant="ghost" onClick={toggleBuilt} aria-pressed={!!deck.inUse} title="Mark decks you've actually put together, so their cards can be kept out of other builds">{deck.inUse ? "✓ built" : "mark built"}</Button>}
          </div>
        }
      >
        {(share.url || share.error) && (
          <div className="mb-4">
            {share.error ? <Notice tone="error">{share.error}</Notice> : (
              <Notice tone="ok">
                {share.copied ? "Link copied. " : "Share this link: "}
                <a href={share.url} className="break-all text-orange underline" target="_blank" rel="noreferrer">{share.url}</a>
                <span className="block text-[14px] text-muted">Anyone with it can view the list, stats and primer, and copy or upgrade it. Your collection isn&apos;t included.{deck.shareId ? " Sharing again after changes updates this same link when you're signed in." : ""}</span>
              </Notice>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Mini label="Cards" value={`${deck.stats.total + deck.commanders.length}`} sub={`of ${meta.size}`} />
          <Mini label="Lands" value={`${deck.stats.lands}`} sub={`avg MV ${deck.stats.avgCmc.toFixed(2)}`} />
          <Mini label="Price" value={fmt(deck.stats.priceUsd, { whole: true })} sub="cheapest owned" />
          <Mini label="Power" value={power ? `${power.score}/10` : "—"} sub={power?.label} />
          <Mini label="Bracket" value={deck.options.format === "commander" ? `~${deck.stats.estimatedBracket ?? "?"}` : "—"} sub={deck.options.bracket ? `target ${deck.options.bracket}` : undefined} />
        </div>
        {power && <div className="mt-4"><PowerMeter power={power} /></div>}
        {!readOnly && (
          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label className="px-label" htmlFor="deck-name">Deck name</label>
              <Input id="deck-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={title} />
            </div>
            <Button size="sm" variant="ghost" onClick={saveName}>save</Button>
          </div>
        )}
        {!readOnly && (
          <label className="mt-3 flex items-center gap-3 text-[16px] text-cream-dim">
            <input type="checkbox" className="h-4 w-4 accent-orange" checked={printings.on} onChange={(e) => printings.setOn(e.target.checked)} />
            Exports include your printings (set, number, foil), so Moxfield and Archidekt show your art. Turn off for Arena and MTGO.
          </label>
        )}
      </Panel>

      {reeval.error && <Notice tone="error">{reeval.error}</Notice>}
      {reeval.result && (
        <ReEvaluatePanel
          deck={deck}
          result={reeval.result}
          onDismiss={reeval.dismiss}
          onApply={async (d) => { await db.builds.put(d); onChange?.(d); reeval.dismiss(); }}
        />
      )}

      {deck.warnings.map((w, i) => (
        <Notice key={i} tone="warn">{w}</Notice>
      ))}

      <Panel title="Decklist">
        {editing && (
          <div className="mb-5 grid gap-4">
            <div className="px-border flex flex-wrap items-center gap-3 bg-navy-900 px-4 py-2 text-[17px]">
              <span className={listCount === meta.size ? "text-cream" : "text-gold"}>{listCount} of {meta.size} cards</span>
              <span className="text-muted">
                {edit.changes.added.length || edit.changes.removed.length
                  ? `${edit.changes.added.length} in · ${edit.changes.removed.length} out`
                  : "Remove cards below, then add from alternatives or your collection."}
              </span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" onClick={edit.save} disabled={edit.saving || (!edit.changes.added.length && !edit.changes.removed.length)}>{edit.saving ? "saving…" : "save changes"}</Button>
                <Button size="sm" variant="ghost" onClick={edit.discard} disabled={edit.saving}>discard</Button>
              </span>
            </div>
            {edit.error && <Notice tone="error">{edit.error}</Notice>}
            <OwnedSearch deck={deck} inDeck={new Set([...listCards, ...deck.commanders].map((c) => c.name))} onAdd={edit.addOwned} />
            <p className="text-[15px] text-muted">Stats, power, combos and the primer update when you save.</p>
          </div>
        )}
        {deck.commanders.length > 0 && <Group label="Commander" cards={deck.commanders} />}
        {groups.map((g) => (
          <Group key={g.role} label={ROLE_LABEL[g.role]} cards={g.cards} action={editing ? "remove" : undefined} />
        ))}
        <p className="mt-2 text-[14px] text-muted">
          Hover a card for the image; tap on mobile. <span className="inline-block h-2 w-2 bg-sea-light align-middle" /> = EDHREC pick, <span className="font-pixel text-[11px] text-gold">GC</span> = game changer.
          {!readOnly && <> Saved builds live under <a href="/saved" className="text-orange underline">Saved</a>; the .txt imports straight into Moxfield, Archidekt, MTGO and Arena.</>}
        </p>
      </Panel>

      {alternatives.length > 0 && (
        <Disclosure summary={`Alternatives you own (${alternatives.length})`} defaultOpen={editing}>
          <p className="mb-3 text-[17px] text-cream-dim">
            {editing ? "Tap + to put one in the deck." : "Eligible cards that just missed the cut, best first. They already pass colour, legality, bracket and budget; use edit to swap them in."}
          </p>
          <ul className="grid gap-[2px] xl:grid-cols-2">
            {alternatives.map((c) => (
              <Row key={c.name} c={c} action={editing ? "add" : undefined} />
            ))}
          </ul>
        </Disclosure>
      )}

      {deck.upgrade && <UpgradeSummaryView deck={deck} />}

      <PrimerView deck={deck} onChange={onChange} />

      {deck.combos && deck.combos.length > 0 && (
        <Disclosure summary={`Combos in this deck (${deck.combos.length})`}>
          <p className="mb-3 text-[16px] text-cream-dim">Found by Commander Spellbook. Two-card infinites push a deck to bracket 4 or higher.</p>
          <ComboList combos={deck.combos} />
        </Disclosure>
      )}

      {deck.aiSummary && (
        <Panel title="Claude's read">
          <p className="whitespace-pre-line text-[19px] text-cream-dim">{deck.aiSummary}</p>
          {deck.aiSwaps && deck.aiSwaps.length > 0 && (
            <ul className="mt-4 grid gap-2 text-[17px]">
              {deck.aiSwaps.map((s, i) => (
                <li key={i} className="px-border bg-navy-900 px-3 py-2">
                  <span className="text-muted line-through">{s.out}</span> <span className="text-orange">→</span> <span className="text-cream">{s.in}</span>
                  <span className="block text-[15px] text-cream-dim">{s.why}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <SampleHand deck={deck} />

      {deck.wishlist?.length > 0 && (
        <Disclosure summary={`EDHREC wishlist — cards you don't own (${deck.wishlist.length})`}>
          <p className="mb-3 text-[17px] text-cream-dim">What EDHREC players run with this commander/theme that isn&apos;t in your collection. Add to your wishlist to track them.</p>
          <ul className="grid gap-[2px] md:grid-cols-2">
            {deck.wishlist.map((w) => (
              <li key={w.name} className="flex items-center justify-between gap-2 px-2 py-1 text-[18px] hover:bg-navy-600">
                <span className="truncate">
                  {w.name}
                  <span className="ml-2 text-[13px] text-muted">
                    {w.synergy !== undefined ? `${w.synergy >= 0 ? "+" : ""}${Math.round(w.synergy * 100)}% synergy` : w.label}
                    {w.inclusion !== undefined ? ` · ${Math.round(w.inclusion * 100)}% of decks` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <BuyLinks name={w.name} compact />
                  <Button size="sm" variant="ghost" onClick={() => addWish(w)}>
                    + wish
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Disclosure summary="Stats and build notes">
        <div className="grid gap-6">
          {power && (
            <section>
              <h3 className="font-pixel mb-2 text-[12px] text-orange">Power</h3>
              <PowerMeter power={power} detail />
            </section>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h3 className="font-pixel mb-2 text-[12px] text-orange">Mana curve</h3>
              <div className="flex h-28 items-end gap-2">
                {deck.stats.curve.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[14px] text-cream-dim">{n || ""}</span>
                    <div className="px-bar w-full" style={{ height: `${Math.max(4, (n / maxCurve) * 80)}px` }} aria-label={`${n} cards at mana value ${i}`} />
                    <span className="font-pixel text-[11px] text-muted">{i === 7 ? "7+" : i}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="font-pixel mb-2 text-[12px] text-orange">Colour pips</h3>
              <div className="flex h-6 w-full gap-[2px] overflow-hidden">
                {(["W", "U", "B", "R", "G"] as Color[]).map((c) =>
                  deck.stats.pips[c] ? (
                    <div key={c} className="flex items-center justify-center gap-1 bg-navy-900 text-[13px] text-cream-dim" style={{ width: `${(deck.stats.pips[c] / pipTotal) * 100}%` }} title={`${c}: ${deck.stats.pips[c]}`}>
                      <ManaSymbol sym={c} size={16} /> {deck.stats.pips[c]}
                    </div>
                  ) : null,
                )}
              </div>
              <h3 className="font-pixel mb-2 mt-5 text-[12px] text-orange">Roles</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[16px] text-cream-dim">
                {Object.entries(deck.stats.roles)
                  .sort((a, b) => b[1] - a[1])
                  .map(([r, n]) => (
                    <span key={r}>
                      {ROLE_LABEL[r as Role] ?? r} <span className="text-cream">{n}</span>
                    </span>
                  ))}
              </div>
              {deck.stats.gameChangers.length > 0 && <p className="mt-3 text-[15px] text-gold">Game changers: {deck.stats.gameChangers.join(", ")}</p>}
            </section>
          </div>
          {noteSections(deck.notes).map((n) => (
            <section key={n.title}>
              <h3 className="font-pixel mb-2 text-[12px] text-orange">{n.title}</h3>
              <ul className="grid gap-1 text-[17px] text-cream-dim">{n.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </section>
          ))}
          {deck.options.format === "commander" && (
            <p className="text-[15px] text-muted">Target bracket: {BRACKETS.find((b) => b.id === deck.options.bracket)?.label ?? "—"}. The bracket estimate counts game changers; combos are listed above.</p>
          )}
        </div>
      </Disclosure>
    </>
  );

  function Row({ c, action }: { c: DeckEntry; action?: "add" | "remove" }) {
    return (
      <li className="flex items-center justify-between gap-2 px-2 py-1 text-[18px] hover:bg-navy-600" {...previewProps(preview, c.imageNormal ?? c.imageSmall, c.name)} tabIndex={0} title={`${c.reason}${c.edhrec ? " · EDHREC pick" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-4 shrink-0 text-muted">{c.quantity}</span>
          {(c.edhrec || c.inAverageDeck) && <span className="h-2 w-2 shrink-0 bg-sea-light" aria-label="EDHREC pick" />}
          <span className="truncate">{c.name}</span>
          {c.gameChanger && <span className="shrink-0 font-pixel text-[11px] text-gold">GC</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ManaCost cost={c.manaCost} size={16} />
          <span className="w-14 text-right text-[14px] text-muted">{fmt(c.priceUsd)}</span>
          {action && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (action === "add") edit.addEntry(c); else edit.remove(c); }}
              aria-label={action === "add" ? `Add ${c.name} to the deck` : `Take ${c.name} out`}
              title={action === "add" ? `Add ${c.name} to the deck` : `Take ${c.name} out`}
              className="inline-flex h-7 w-7 items-center justify-center text-cream-dim hover:bg-navy-900 hover:text-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange"
            >
              <Sprite grid={action === "add" ? GLYPH_PLUS : GLYPH_CROSS} scale={2} />
            </button>
          )}
        </span>
      </li>
    );
  }

  function Group({ label, cards, action }: { label: string; cards: DeckEntry[]; action?: "add" | "remove" }) {
    const n = cards.reduce((s, c) => s + c.quantity, 0);
    return (
      <div className="mb-5">
        <h3 className="font-pixel mb-2 text-[13px] text-orange">
          {label} <span className="text-muted">{n}</span>
        </h3>
        <ul className="grid gap-[2px] xl:grid-cols-2">
          {cards.map((c) => (
            <Row key={c.name} c={c} action={action} />
          ))}
        </ul>
      </div>
    );
  }
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-navy-900 px-3 py-2">
      <div className="px-label mb-1">{label}</div>
      <div className="font-pixel text-[17px] text-cream">{value}</div>
      {sub && <div className="text-[14px] text-muted">{sub}</div>}
    </div>
  );
}

/** Build notes grouped under a heading each ("Pool: …" → Pool), with the prefix dropped. */
function noteSections(notes: string[]): { title: string; lines: string[] }[] {
  const out = new Map<string, string[]>();
  for (const n of notes) {
    const m = /^(Pool|Card roles|Template|EDHREC|Combos)\b[^:]*:\s*/.exec(n);
    const title = m ? (m[1] === "Template" ? "Starting template" : m[1]) : /^EDHREC's average/.test(n) || /curve/.test(n) ? "Mana base and curve" : "Notes";
    const line = m && m[1] !== "EDHREC" ? n.slice(m[0].length) : n;
    out.set(title, [...(out.get(title) ?? []), line.charAt(0).toUpperCase() + line.slice(1)]);
  }
  return [...out].map(([title, lines]) => ({ title, lines }));
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
}
