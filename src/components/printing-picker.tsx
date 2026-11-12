"use client";

import { useEffect, useState } from "react";
import { movePrinting, ownedId } from "@/lib/collection";
import { scryfallImage } from "@/lib/scryfall";
import type { CardData, OwnedCard } from "@/lib/types";
import { useCurrency } from "./currency-provider";
import { Button, Chip, Input, Notice } from "./ui";

const cache = new Map<string, CardData[]>();

/**
 * Inline picker for "which printing is this, really?": every paper printing of the card from
 * Scryfall, a finish toggle, and how many of the row's copies to move. Opens under the row.
 */
export function PrintingPicker({ row, onDone }: { row: OwnedCard; onDone: () => void }) {
  const oracleId = row.card?.oracleId ?? "";
  const [prints, setPrints] = useState<CardData[] | null>(() => cache.get(oracleId) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [foil, setFoil] = useState(!!row.foil);
  const [count, setCount] = useState(row.quantity);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { fromUsd, code } = useCurrency();

  useEffect(() => {
    if (!oracleId || cache.has(oracleId)) return;
    let alive = true;
    fetch(`/api/prints?oracleId=${encodeURIComponent(oracleId)}`)
      .then((r) => r.json() as Promise<{ prints?: CardData[]; error?: string }>)
      .then((j) => {
        if (!alive) return;
        if (!j.prints?.length) { setError(j.error ?? "Scryfall has no other printings of this card."); return; }
        cache.set(oracleId, j.prints);
        setPrints(j.prints);
      })
      .catch(() => alive && setError("Couldn't reach Scryfall. Try again in a minute."));
    return () => { alive = false; };
  }, [oracleId]);

  async function pick(card: CardData) {
    setBusy(true);
    try {
      await movePrinting(row, card, foil, count);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!row.card) return <Notice tone="warn">This row has no Scryfall match yet, so there are no printings to choose from.</Notice>;

  const needle = q.trim().toLowerCase();
  const shown = (prints ?? []).filter((p) => !needle || p.setName.toLowerCase().includes(needle) || p.setCode.toLowerCase() === needle || p.collectorNumber === needle);
  const currentId = row.id;

  return (
    <div className="grid gap-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-label !mb-0">Finish</span>
        <Chip pressed={!foil} onClick={() => setFoil(false)}>Non-foil</Chip>
        <Chip pressed={foil} onClick={() => setFoil(true)}>Foil</Chip>
        {row.quantity > 1 && (
          <label className="ml-2 flex items-center gap-2 text-[16px] text-cream-dim">
            Move
            <Input type="number" min={1} max={row.quantity} value={count} onChange={(e) => setCount(Math.max(1, Math.min(row.quantity, Number(e.target.value) || 1)))} className="!w-20" aria-label="Copies to move" />
            of {row.quantity}
          </label>
        )}
        <Input placeholder="Filter sets…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-48 sm:ml-auto" aria-label="Filter printings" />
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      {!prints && !error && <p className="text-[16px] text-muted">Loading printings from Scryfall…</p>}
      {prints && (
        <ul className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-6">
          {shown.map((p) => {
            const here = ownedId(p.scryfallId, foil) === currentId;
            const price = foil ? p.priceUsdFoil ?? p.priceUsd : p.priceUsd;
            const noFinish = p.finishes && !p.finishes.includes(foil ? "foil" : "nonfoil") && !(foil && p.finishes.includes("etched"));
            return (
              <li key={p.scryfallId}>
                <button
                  type="button"
                  disabled={busy || here}
                  onClick={() => pick(p)}
                  className={`px-border block w-full bg-navy-900 p-1.5 text-left hover:bg-navy-600 disabled:cursor-default ${here ? "outline outline-2 outline-orange" : ""}`}
                  title={`${p.setName} #${p.collectorNumber}${p.releasedAt ? ` · ${p.releasedAt.slice(0, 4)}` : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageSmall ?? scryfallImage(p.scryfallId, "small")} alt="" width={146} height={204} loading="lazy" className="block h-auto w-full" style={{ imageRendering: "auto" }} />
                  <span className="mt-1 block truncate text-[15px] text-cream">{p.setName}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
                    <span className="uppercase">{p.setCode}</span>
                    <span>#{p.collectorNumber}</span>
                    {p.releasedAt && <span>{p.releasedAt.slice(0, 4)}</span>}
                    {p.fullArt && <span className="text-gold">full art</span>}
                    {noFinish && <span className="text-orange">no {foil ? "foil" : "non-foil"}</span>}
                    <span className="ml-auto text-cream-dim">{price != null ? `${fromUsd(price).toFixed(2)} ${code}` : "—"}</span>
                  </span>
                  {here && <span className="font-pixel block text-[9px] text-orange">current</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
