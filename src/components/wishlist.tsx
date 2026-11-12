"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { tcgplayerMassEntry } from "@/lib/stores";
import { BuyLinks } from "./buy-links";
import { useCurrency } from "./currency-provider";
import { Button, Panel } from "./ui";

/** Current prices for the wishlist (Scryfall, cheapest-printing fallback on the server). */
function usePrices(names: string[]) {
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const key = names.join("|");
  useEffect(() => {
    const todo = key ? key.split("|") : [];
    if (!todo.length) return;
    let alive = true;
    (async () => {
      const out: Record<string, number | null> = {};
      for (let i = 0; i < todo.length; i += 75) {
        const chunk = todo.slice(i, i + 75);
        try {
          const res = await fetch("/api/scryfall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }) });
          const j = (await res.json()) as { cards?: Record<string, { priceUsd: number | null }> };
          for (const n of chunk) out[n] = j.cards?.[`n:${n.toLowerCase()}`]?.priceUsd ?? null;
        } catch { /* offline: no prices */ }
      }
      if (alive) setPrices(out);
    })();
    return () => { alive = false; };
  }, [key]);
  return prices;
}

export function Wishlist() {
  const wishlist = useLiveQuery(() => db.wishlist.orderBy("addedAt").reverse().toArray(), []);
  const { fmt, code } = useCurrency();
  const names = useMemo(() => (wishlist ?? []).map((w) => w.name).sort(), [wishlist]);
  const prices = usePrices(names);
  const total = names.reduce((s, n) => s + (prices[n] ?? 0), 0);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-6">
      <Panel
        title={`Wishlist (${wishlist?.length ?? 0})`}
        aside={wishlist?.length ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(wishlist.map((w) => `1 ${w.name}`).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "copied" : "copy as list"}</Button>
            {(code === "USD" || code === "CAD") && <a className="px-btn px-btn-sm inline-block" href={tcgplayerMassEntry(names)} target="_blank" rel="noreferrer">all on TCGplayer</a>}
          </div>
        ) : undefined}
      >
        {!wishlist?.length && <p className="text-[18px] text-muted">Empty. Add cards from a build&apos;s EDHREC wishlist.</p>}
        {total > 0 && <p className="mb-3 text-[16px] text-cream-dim">About <span className="text-cream">{fmt(total, { whole: true })}</span> for one of each, at the cheapest printing. Store links search for the card on that site.</p>}
        <ul className="grid gap-[2px] md:grid-cols-2">
          {wishlist?.map((w) => (
            <li key={w.name} className="flex items-center justify-between gap-2 px-2 py-2 hover:bg-navy-600">
              <span className="min-w-0">
                <span className="block truncate text-[18px]">
                  {w.name}
                  {prices[w.name] != null && <span className="ml-2 text-[14px] text-cream-dim">{fmt(prices[w.name])}</span>}
                </span>
                {w.forDeck && <span className="block truncate text-[13px] text-muted">for {w.forDeck}</span>}
                <BuyLinks name={w.name} />
              </span>
              <Button size="sm" variant="ghost" onClick={() => db.wishlist.delete(w.name)} aria-label={`Remove ${w.name}`}>✕</Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
