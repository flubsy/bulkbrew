"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { printingIndex, type PrintingLookup } from "@/lib/printings";

const KEY = "deckbit.exportPrintings";

/** Your printings for exports, plus the per-device "include them" preference (on by default). */
export function usePrintings(): { lookup: PrintingLookup | undefined; on: boolean; setOn: (v: boolean) => void } {
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const [on, setOnState] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      try { if (localStorage.getItem(KEY) === "0") setOnState(false); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const setOn = (v: boolean) => {
    setOnState(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };
  const index = useMemo(() => (owned ? printingIndex(owned) : undefined), [owned]);
  return { lookup: on ? index : undefined, on, setOn };
}
