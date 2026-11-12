"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { RESERVE_LABEL, type ReserveMode } from "@/lib/reserve";
import { Label, Select } from "./ui";

/** "Cards already in other decks" picker, shared by Build and Upgrade (remembered per device; Roll uses it too). */
export function ReserveSelect({ mode, onChange }: { mode: ReserveMode; onChange: (m: ReserveMode) => void }) {
  const built = useLiveQuery(() => db.builds.filter((b) => !!b.inUse).count(), [], 0);
  return (
    <div>
      <Label hint="remembered on this device">Cards already in other decks</Label>
      <Select value={mode} onChange={(e) => onChange(e.target.value as ReserveMode)} aria-label="Cards already in other decks">
        {(Object.keys(RESERVE_LABEL) as ReserveMode[]).map((m) => (
          <option key={m} value={m}>{RESERVE_LABEL[m]}{m === "built" ? ` (${built})` : ""}</option>
        ))}
      </Select>
      <p className="mt-2 text-[14px] text-muted">
        Counts copies: own two and one is in another deck, one is still free.
        {mode === "built" && !built ? " No decks are marked built yet: open Saved and tap “mark built” on the decks you've actually put together." : ""}
        {mode === "all" ? " Every build is saved automatically, so this also counts experiments. “Built” is usually better." : ""}
      </p>
    </div>
  );
}
