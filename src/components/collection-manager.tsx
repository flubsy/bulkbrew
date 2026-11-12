"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { clearSynced, db, exportBackup, importBackup, type Backup } from "@/lib/db";
import { download } from "@/lib/export";
import { groupOwned, isStaple, STAPLE_RANK } from "@/lib/collection";
import { isCommanderCard } from "@/lib/builder/commanders";
import { CollectionTable } from "./collection-table";
import { useCollectionImport } from "./use-collection-import";
import { useCurrency } from "./currency-provider";
import { Button, Chip, Input, Label, Notice, Panel, Progress, Select, TextArea } from "./ui";


export function CollectionManager() {
  const [pasted, setPasted] = useState("");
  const { phase, setPhase, detected, importText, importFile: handleFile } = useCollectionImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const owned = useLiveQuery(() => db.owned.orderBy("name").toArray(), []);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [sort, setSort] = useState<"name" | "price" | "qty" | "cmc" | "popular">("name");
  const [only, setOnly] = useState<"" | "commanders" | "staples" | "unmatched">("");
  const { fmt } = useCurrency();
  const [priceFix, setPriceFix] = useState<string | null>(null);

  async function backup() {
    const b = await exportBackup();
    download(`bulkbrew-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b), "application/json");
  }

  async function restore(file: File) {
    try {
      const b = JSON.parse(await file.text()) as Backup;
      const replace = confirm(`Restore ${b.owned?.length ?? 0} cards, ${b.builds?.length ?? 0} decks, ${b.refDecks?.length ?? 0} reference decks.\n\nOK = replace everything on this device. Cancel = merge into what's here.`);
      await importBackup(b, replace ? "replace" : "merge");
      setPhase({ kind: "done", added: b.owned?.length ?? 0, missing: [] });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Restore failed" });
    }
  }

  /** Rows whose printing has no Scryfall price (often non-English cards): price them from the cheapest printing. */
  async function fixPrices() {
    const rows = (await db.owned.toArray()).filter((c) => c.card && c.card.priceUsd == null && c.card.oracleId);
    const ids = [...new Set(rows.map((r) => r.card!.oracleId))];
    let fixed = 0;
    setPriceFix(`Pricing ${ids.length} cards…`);
    try {
      for (let i = 0; i < ids.length; i += 300) {
        const res = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oracleIds: ids.slice(i, i + 300) }) });
        const { prices } = (await res.json()) as { prices?: Record<string, number> };
        const updates = rows.filter((r) => prices?.[r.card!.oracleId] != null).map((r) => ({ ...r, card: { ...r.card!, priceUsd: prices![r.card!.oracleId] } }));
        if (updates.length) await db.owned.bulkPut(updates);
        fixed += updates.length;
        setPriceFix(`Priced ${fixed} of ${rows.length}…`);
      }
      setPriceFix(fixed ? `Priced ${fixed} rows from their cheapest printing.${fixed < rows.length ? ` ${rows.length - fixed} have no price anywhere on Scryfall (digital-only, tokens, oversized…).` : ""}` : "Scryfall has no price for any printing of these cards.");
    } catch {
      setPriceFix("Couldn't reach Scryfall. Try again in a minute.");
    }
  }

  async function clearAll() {
    if (!confirm("Delete your whole collection from this browser?")) return;
    await clearSynced("owned");
    setPhase({ kind: "idle" });
  }

  const stats = useMemo(() => {
    if (!owned) return null;
    const cards = owned.reduce((s, c) => s + c.quantity, 0);
    const value = owned.reduce((s, c) => s + (c.card?.priceUsd ?? 0) * c.quantity, 0);
    const unmatched = owned.filter((c) => !c.card).length;
    const unpriced = owned.filter((c) => c.card && c.card.priceUsd == null && !/^Basic Land/.test(c.card.typeLine)).length;
    const groups = groupOwned(owned);
    const legendary = groups.filter((g) => g.card && isCommanderCard(g.card, "commander")).length;
    return { cards, value, unmatched, unpriced, legendary, unique: groups.length };
  }, [owned]);

  const { groups, basics } = useMemo(() => {
    if (!owned) return { groups: [], basics: [] };
    const needle = q.trim().toLowerCase();
    const list = groupOwned(owned).filter((g) => {
      const c = g.card;
      if (needle && !g.name.toLowerCase().includes(needle) && !(c?.oracleText ?? "").toLowerCase().includes(needle) && !(c?.typeLine ?? "").toLowerCase().includes(needle)) return false;
      if (typeFilter && !(c?.typeLine ?? "").includes(typeFilter)) return false;
      if (colorFilter) {
        const ci = c?.colorIdentity ?? [];
        if (colorFilter === "C" ? ci.length !== 0 : !ci.includes(colorFilter as never)) return false;
      }
      if (only === "commanders" && !(c && isCommanderCard(c, "commander"))) return false;
      if (only === "staples" && !isStaple(c)) return false;
      if (only === "unmatched" && g.rows.every((r) => r.card)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "price") return (b.priceMax ?? 0) - (a.priceMax ?? 0);
      if (sort === "qty") return b.qty - a.qty;
      if (sort === "cmc") return (a.card?.cmc ?? 0) - (b.card?.cmc ?? 0) || a.name.localeCompare(b.name);
      if (sort === "popular") return (a.card?.edhrecRank ?? 1e9) - (b.card?.edhrecRank ?? 1e9);
      return a.name.localeCompare(b.name);
    });
    // Basic lands go behind one summary row unless the search is looking for them.
    const wantBasics = !!needle || typeFilter === "Basic";
    return { groups: wantBasics ? list : list.filter((g) => !g.basic), basics: wantBasics ? [] : list.filter((g) => g.basic) };
  }, [owned, q, typeFilter, colorFilter, sort, only]);
  const shownCount = groups.length + basics.length;

  return (
    <div className="mt-8 grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Upload a file">
          <label className="px-border block cursor-pointer bg-navy-900 p-8 text-center hover:bg-navy-600" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <span className="font-pixel block text-[15px] text-orange">Drop CSV / XLSX here</span>
            <span className="mt-3 block text-[17px] text-cream-dim">or tap to choose · ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, TCGplayer</span>
          </label>
          <p className="mt-4 text-[16px] text-muted">
            Headers are matched fuzzily: <em>Name</em> plus any of <em>Quantity / Count / Qty</em>, and optionally <em>Set code</em>, <em>Collector number</em>, <em>Scryfall ID</em>, <em>Foil</em>.
          </p>
        </Panel>

        <Panel title="Or paste">
          <Label hint="CSV, TSV copied from Sheets, or a plain '4 Lightning Bolt' list">Text</Label>
          <TextArea rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Name,Set code,Quantity\nSol Ring,c21,1\nRhystic Study,pcy,1\n\n– or –\n\n1 Sol Ring (C21) 123\n4 Lightning Bolt"} />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => importText(pasted)} disabled={!pasted.trim() || phase.kind === "enriching"}>
              Import pasted
            </Button>
            <Button variant="ghost" onClick={() => setPasted("")}>
              Clear
            </Button>
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[16px] text-muted">
        <span className="px-label !mb-0 mr-2">Backup</span>
        <Button size="sm" variant="ghost" onClick={backup}>Download everything (.json)</Button>
        <label className="px-btn px-btn-ghost px-btn-sm cursor-pointer">
          Restore from backup
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
        </label>
        <span>Collection, saved decks, reference decks and wishlist. Move it to your phone, or keep it safe until accounts exist.</span>
      </div>

      {phase.kind === "parsing" && <Notice>Reading file…</Notice>}
      {phase.kind === "enriching" && (
        <Panel>
          <Progress value={phase.done} max={phase.total} label={`Matching to Scryfall${detected ? ` · detected ${detected}` : ""}`} />
        </Panel>
      )}
      {phase.kind === "done" && (
        <Notice tone="ok">
          Imported {phase.added} rows{detected ? ` (${detected})` : ""}.{" "}
          {phase.missing.length > 0 && (
            <span className="text-gold">
              {phase.missing.length} not matched: {phase.missing.slice(0, 8).join(", ")}
              {phase.missing.length > 8 ? "…" : ""}
            </span>
          )}
        </Notice>
      )}
      {phase.kind === "error" && <Notice tone="error">{phase.message}</Notice>}

      {stats && owned && owned.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Cards" value={stats.cards.toLocaleString()} />
            <MiniStat label="Unique" value={stats.unique.toLocaleString()} />
            <MiniStat label="Value" value={fmt(stats.value, { whole: true })} />
            <MiniStat label="Can be commander" value={stats.legendary.toLocaleString()} />
          </div>
          {stats.unmatched > 0 && <Notice tone="warn">{stats.unmatched} rows have no Scryfall match and will be ignored by the builder. Search for them below and check the spelling.</Notice>}
          {(stats.unpriced > 0 || priceFix) && (
            <Notice tone={priceFix ? "info" : "warn"}>
              {priceFix ?? `${stats.unpriced} ${stats.unpriced === 1 ? "row has" : "rows have"} no price. Scryfall doesn't price some printings (non-English cards, promos, MTGO/Arena versions).`}{" "}
              {stats.unpriced > 0 && !priceFix?.endsWith("…") && <Button size="sm" variant="ghost" onClick={fixPrices}>use cheapest printing</Button>}
            </Notice>
          )}

          <Panel
            title={`Cards (${shownCount})`}
            aside={
              <Button size="sm" variant="ghost" onClick={clearAll}>
                Delete all
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Input placeholder="Search name, text, type…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search collection" />
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
                <option value="">Any type</option>
                {["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Basic", "Legendary", "Battle"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} aria-label="Colour">
                <option value="">Any colour</option>
                <option value="W">White · sun</option>
                <option value="U">Blue · drop</option>
                <option value="B">Black · skull</option>
                <option value="R">Red · flame</option>
                <option value="G">Green · tree</option>
                <option value="C">Colourless</option>
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                <option value="name">Sort: name</option>
                <option value="price">Sort: price</option>
                <option value="qty">Sort: quantity</option>
                <option value="cmc">Sort: mana value</option>
                <option value="popular">Sort: most played (EDHREC)</option>
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="px-label !mb-0 mr-1">Show only</span>
              <Chip pressed={only === "commanders"} onClick={() => setOnly(only === "commanders" ? "" : "commanders")} title="Legendary creatures and cards that say they can be your commander">Can be your commander</Chip>
              <Chip pressed={only === "staples"} onClick={() => setOnly(only === "staples" ? "" : "staples")} title={`Game changers and the ${STAPLE_RANK} most-played Commander cards on EDHREC`}>Staples</Chip>
              {stats.unmatched > 0 && <Chip pressed={only === "unmatched"} onClick={() => setOnly(only === "unmatched" ? "" : "unmatched")}>No Scryfall match</Chip>}
            </div>
            <CollectionTable groups={groups} basics={basics} />
          </Panel>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-border px-panel px-4 py-3">
      <div className="px-label mb-1">{label}</div>
      <div className="font-pixel text-[18px] text-cream">{value}</div>
    </div>
  );
}
