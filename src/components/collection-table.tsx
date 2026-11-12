"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { removeRows, restoreRows, setQuantity, unitPrice, type CardGroup } from "@/lib/collection";
import { comboName, type OwnedCard } from "@/lib/types";
import { useCurrency } from "./currency-provider";
import { ColorIdentity } from "./mana";
import { PrintingPicker } from "./printing-picker";
import { GLYPH_CHEVRON, GLYPH_CROSS, GLYPH_MINUS, GLYPH_PLUS, GLYPH_SWAP, Sprite } from "./sprites";
import { Button, ManaCost, Notice, Select } from "./ui";

const PAGE_SIZES = [100, 400, 1000];
const COLS = 8;

/**
 * The collection, one row per card. A card owned in several printings expands to show each
 * printing; quantities, printings and removals are edited in place. Basic lands sit behind a
 * single summary row so they don't bury the rest.
 */
export function CollectionTable({ groups, basics }: { groups: CardGroup[]; basics: CardGroup[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBasics, setShowBasics] = useState(false);
  const [removed, setRemoved] = useState<{ rows: OwnedCard[]; label: string } | null>(null);
  const { fromUsd, code } = useCurrency();

  const [pageSize, setPageSize] = useState(400);
  const [pageWanted, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const page = Math.min(pageWanted, pages - 1); // filters can shrink the list under the current page
  const shown = groups.slice(page * pageSize, (page + 1) * pageSize);
  const onLastPage = page === pages - 1;
  const visible = useMemo(() => [...shown, ...(showBasics ? basics : [])], [shown, basics, showBasics]);
  const byKey = useMemo(() => new Map([...groups, ...basics].map((g) => [g.key, g])), [groups, basics]);
  const chosen = [...selected].map((k) => byKey.get(k)).filter((g): g is CardGroup => !!g);
  const chosenCards = chosen.reduce((s, g) => s + g.qty, 0);
  const allChosen = visible.length > 0 && visible.every((g) => selected.has(g.key));

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; };
  const price = (p: number | null) => (p != null ? fromUsd(p).toFixed(2) : "—");

  async function remove(rows: OwnedCard[], label: string) {
    await removeRows(rows);
    setRemoved({ rows, label });
    setSelected((s) => { const n = new Set(s); for (const g of [...byKey.values()]) if (g.rows.every((r) => rows.includes(r))) n.delete(g.key); return n; });
  }

  async function step(row: OwnedCard, delta: number) {
    if (row.quantity + delta <= 0) return remove([row], `${row.name} (${(row.card?.setCode ?? row.setCode ?? "").toUpperCase()})`);
    await setQuantity(row, row.quantity + delta);
  }

  async function removeSelected() {
    const rows = chosen.flatMap((g) => g.rows);
    if (!confirm(`Remove ${chosen.length} ${chosen.length === 1 ? "card" : "cards"} (${chosenCards} ${chosenCards === 1 ? "copy" : "copies"}) from your collection?`)) return;
    await remove(rows, `${chosen.length} cards`);
    setSelected(new Set());
  }

  const basicCount = basics.reduce((s, g) => s + g.qty, 0);

  return (
    <>
      {removed && (
        <div className="mt-4">
          <Notice tone="ok">
            Removed {removed.label}.{" "}
            <Button size="sm" variant="ghost" onClick={async () => { await restoreRows(removed.rows); setRemoved(null); }}>Undo</Button>
          </Notice>
        </div>
      )}
      {selected.size > 0 && (
        <div className="px-border mt-4 flex flex-wrap items-center gap-3 bg-navy-900 px-4 py-2 text-[17px]">
          <span className="text-cream">{chosen.length} selected · {chosenCards} {chosenCards === 1 ? "copy" : "copies"}</span>
          <Button size="sm" onClick={removeSelected}>Remove from collection</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="px-table w-full min-w-[760px] text-[18px]">
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" className="h-4 w-4 accent-orange" checked={allChosen} onChange={() => setSelected(allChosen ? new Set() : new Set(visible.map((g) => g.key)))} aria-label="Select all shown cards" />
              </th>
              <th>Name</th>
              <th>Cost</th>
              <th>ID</th>
              <th>Type</th>
              <th>Printing</th>
              <th className="text-right">{code}</th>
              <th className="text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <Fragment key={g.key}>{groupRows(g)}</Fragment>
            ))}
            {onLastPage && basics.length > 0 && (
              <tr>
                <td colSpan={COLS} className="!p-0">
                  <button type="button" onClick={() => setShowBasics((v) => !v)} aria-expanded={showBasics} className="flex w-full items-center gap-3 px-3 py-2 text-left text-cream-dim hover:bg-navy-600">
                    <Sprite grid={GLYPH_CHEVRON} scale={2} className={showBasics ? "rotate-90" : ""} />
                    <span className="text-cream">Basic lands</span>
                    <span>{basicCount} cards · {basics.map((b) => `${b.name.replace(/^Snow-Covered /, "Snow ")} ${b.qty}`).join(" · ")}</span>
                    <span className="ml-auto text-[15px] text-muted">{showBasics ? "hide" : "show by set and art"}</span>
                  </button>
                </td>
              </tr>
            )}
            {onLastPage && showBasics && basics.map((g) => <Fragment key={g.key}>{groupRows(g)}</Fragment>)}
          </tbody>
        </table>
        {groups.length > PAGE_SIZES[0] && (
          <nav className="mt-3 flex flex-wrap items-center gap-2 text-[16px] text-cream-dim" aria-label="Collection pages">
            <Button size="sm" variant="ghost" onClick={() => setPage(0)} disabled={page === 0}>first</Button>
            <Button size="sm" variant="ghost" onClick={() => setPage(page - 1)} disabled={page === 0}>prev</Button>
            <span>
              Page {page + 1} of {pages} · cards {page * pageSize + 1}–{Math.min(groups.length, (page + 1) * pageSize)} of {groups.length}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setPage(page + 1)} disabled={onLastPage}>next</Button>
            <Button size="sm" variant="ghost" onClick={() => setPage(pages - 1)} disabled={onLastPage}>last</Button>
            <label className="ml-auto flex items-center gap-2">
              Per page
              <Select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="!w-24" aria-label="Cards per page">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
          </nav>
        )}
        {groups.length === 0 && basics.length === 0 && <p className="mt-3 text-[16px] text-muted">No cards match these filters.</p>}
      </div>
    </>
  );

  function groupRows(g: CardGroup) {
    const single = g.rows.length === 1 ? g.rows[0] : null;
    const isOpen = open.has(g.key);
    const c = g.card;
    return (
      <Fragment>
        <tr>
          <td>
            <input type="checkbox" className="h-4 w-4 accent-orange" checked={selected.has(g.key)} onChange={() => setSelected((s) => toggle(s, g.key))} aria-label={`Select ${g.name}`} />
          </td>
          <td>
            {single ? (
              <span className={c ? "" : "text-orange"}>{g.name}</span>
            ) : (
              <button type="button" onClick={() => setOpen((s) => toggle(s, g.key))} aria-expanded={isOpen} className="inline-flex items-center gap-2 text-left hover:text-orange">
                <Sprite grid={GLYPH_CHEVRON} scale={2} className={isOpen ? "rotate-90" : ""} />
                {g.name}
              </button>
            )}
            {c?.gameChanger && <span className="ml-2 font-pixel text-[7px] text-gold" title="Game changer">GC</span>}
            {single && !c && <span className="ml-2 text-[14px] text-muted">({single.enrichError})</span>}
          </td>
          <td><ManaCost cost={c?.manaCost ?? ""} /></td>
          <td>{c && <ColorIdentity ci={c.colorIdentity} size={16} label={comboName(c.colorIdentity)} />}</td>
          <td className="text-cream-dim">{c?.typeLine ?? "—"}</td>
          <td>
            {single ? (
              printingCell(single)
            ) : (
              <button type="button" onClick={() => setOpen((s) => toggle(s, g.key))} className="text-muted hover:text-orange">
                {g.rows.length} printings
              </button>
            )}
          </td>
          <td className="text-right text-cream-dim">
            {single ? price(unitPrice(single)) : g.priceMin === g.priceMax ? price(g.priceMin) : `${price(g.priceMin)}–${price(g.priceMax)}`}
          </td>
          <td className="text-right">
            {single ? qtyControls(single) : (
              <span className="inline-flex items-center gap-1">
                <span className="min-w-[2ch] text-right text-cream">{g.qty}</span>
                <IconButton glyph={GLYPH_CROSS} label={`Remove every ${g.name}`} onClick={() => remove(g.rows, `${g.qty} × ${g.name}`)} />
              </span>
            )}
          </td>
        </tr>
        {single && picking === single.id && pickerRow(single)}
        {!single && isOpen && g.rows.map((r) => (
          <Fragment key={r.id}>
            <tr className="bg-navy-900/60">
              <td />
              <td colSpan={4} className="!pl-8 text-cream-dim">
                {r.card?.setName ?? r.setCode?.toUpperCase() ?? "Unknown set"}
                {r.card?.releasedAt && <span className="ml-2 text-muted">{r.card.releasedAt.slice(0, 4)}</span>}
              </td>
              <td>{printingCell(r)}</td>
              <td className="text-right text-cream-dim">{price(unitPrice(r))}</td>
              <td className="text-right">{qtyControls(r)}</td>
            </tr>
            {picking === r.id && pickerRow(r)}
          </Fragment>
        ))}
      </Fragment>
    );
  }

  function printingCell(row: OwnedCard) {
    const c = row.card;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <span className="uppercase text-muted">{c?.setCode ?? row.setCode ?? ""}</span>
        {(c?.collectorNumber ?? row.collectorNumber) && <span className="text-muted">#{c?.collectorNumber ?? row.collectorNumber}</span>}
        {row.foil && <span className="font-pixel text-[8px] text-sea-light">FOIL</span>}
        {c?.fullArt && <span className="font-pixel text-[8px] text-gold">FULL ART</span>}
        {c && <IconButton glyph={GLYPH_SWAP} label={`Change printing or finish of ${row.name}`} onClick={() => setPicking((p) => (p === row.id ? null : row.id))} pressed={picking === row.id} />}
      </span>
    );
  }

  function qtyControls(row: OwnedCard) {
    return (
      <span className="inline-flex items-center gap-1">
        <IconButton glyph={GLYPH_MINUS} label={row.quantity > 1 ? `One fewer ${row.name}` : `Remove ${row.name}`} onClick={() => step(row, -1)} />
        <span className="min-w-[2ch] text-center text-cream">{row.quantity}</span>
        <IconButton glyph={GLYPH_PLUS} label={`One more ${row.name}`} onClick={() => step(row, 1)} />
        <IconButton glyph={GLYPH_CROSS} label={`Remove ${row.name}`} onClick={() => remove([row], row.quantity > 1 ? `${row.quantity} × ${row.name}` : row.name)} />
      </span>
    );
  }

  function pickerRow(row: OwnedCard) {
    return (
      <tr className="hover:!bg-transparent">
        <td colSpan={COLS} className="bg-navy-900">
          <PrintingPicker row={row} onDone={() => setPicking(null)} />
        </td>
      </tr>
    );
  }
}

function IconButton({ glyph, label, onClick, pressed }: { glyph: string[]; label: string; onClick: () => void; pressed?: boolean }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="inline-flex h-7 w-7 items-center justify-center text-cream-dim hover:bg-navy-600 hover:text-orange aria-pressed:text-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange"
    >
      <Sprite grid={glyph} scale={2} />
    </button>
  );
}
