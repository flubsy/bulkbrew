"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CURRENCIES, FALLBACK_RATES, formatMoney, guessCurrency, isCurrency, symbolOf, type CurrencyCode, type Rates } from "@/lib/currency";

const KEY = "deckbit.currency";
const RATES_KEY = "deckbit.fx";

interface CurrencyState {
  code: CurrencyCode;
  symbol: string;
  rates: Rates;
  setCode: (c: CurrencyCode) => void;
  /** Format a USD amount in the chosen currency. */
  fmt: (usd: number | null | undefined, opts?: { whole?: boolean }) => string;
  fromUsd: (usd: number) => number;
  toUsd: (local: number) => number;
}

const Ctx = createContext<CurrencyState>({
  code: "USD", symbol: "US$", rates: FALLBACK_RATES, setCode: () => {},
  fmt: (usd) => formatMoney(usd, "USD", FALLBACK_RATES), fromUsd: (x) => x, toUsd: (x) => x,
});

export const useCurrency = () => useContext(Ctx);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<CurrencyCode>("USD");
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);

  useEffect(() => {
    // Restore after hydration (the server always renders USD).
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(KEY);
        setCodeState(isCurrency(saved) ? saved : guessCurrency(navigator.languages ?? [navigator.language]));
        const fx = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null") as { t: number; rates: Rates } | null;
        if (fx?.rates) setRates(fx.rates);
        if (fx && Date.now() - fx.t < 12 * 3600_000) return;
      } catch { /* ignore */ }
      fetch("/api/fx")
        .then((r) => r.json())
        .then((j: { rates?: Rates; source?: string }) => {
          if (!j.rates) return;
          setRates(j.rates);
          if (j.source === "live") try { localStorage.setItem(RATES_KEY, JSON.stringify({ t: Date.now(), rates: j.rates })); } catch { /* ignore */ }
        })
        .catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const setCode = useCallback((c: CurrencyCode) => {
    setCodeState(c);
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  }, []);

  const value = useMemo<CurrencyState>(() => {
    const r = rates[code] ?? 1;
    return {
      code, rates, setCode, symbol: symbolOf(code),
      fmt: (usd, opts) => formatMoney(usd, code, rates, opts),
      fromUsd: (usd) => usd * r,
      toUsd: (local) => local / r,
    };
  }, [code, rates, setCode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Compact currency picker for the header. */
export function CurrencyPicker() {
  const { code, setCode } = useCurrency();
  return (
    <label className="px-chip px-border !px-0 !py-0" title="Currency for prices">
      <span className="sr-only">Currency</span>
      <select value={code} onChange={(e) => setCode(e.target.value as CurrencyCode)} className="cursor-pointer appearance-none bg-transparent px-2 py-1 text-[14px] text-cream-dim outline-none">
        {CURRENCIES.map((c) => <option key={c.code} value={c.code} className="bg-navy-900">{c.code}</option>)}
      </select>
    </label>
  );
}
