"use client";

import { storesFor } from "@/lib/stores";
import { useCurrency } from "./currency-provider";

/**
 * "Buy" links for a card, picked by the chosen currency: TCGplayer + Card Kingdom for USD,
 * Card Kingdom + Cardmarket for EUR/GBP, MTG Singles for NZ / AU. `compact` shows only those;
 * the full version adds the other stores after a divider.
 */
export function BuyLinks({ name, compact = false }: { name: string; compact?: boolean }) {
  const { code } = useCurrency();
  const { primary, other } = storesFor(code);
  const link = (s: (typeof primary)[number], strong: boolean) => (
    <a
      key={s.id}
      href={s.url(name)}
      target="_blank"
      rel="noreferrer"
      className={`whitespace-nowrap text-[14px] underline underline-offset-2 ${strong ? "text-orange" : "text-muted hover:text-cream-dim"}`}
      title={`Search ${s.label} (${s.region}) for ${name}`}
    >
      {s.label}
    </a>
  );
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {primary.map((s) => link(s, true))}
      {!compact && other.length > 0 && <span className="text-[13px] text-muted" aria-hidden>·</span>}
      {!compact && other.map((s) => link(s, false))}
    </span>
  );
}
