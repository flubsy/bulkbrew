"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Button, Panel } from "./ui";

export function Wishlist() {
  const wishlist = useLiveQuery(() => db.wishlist.orderBy("addedAt").reverse().toArray(), []);
  return (
    <div className="mt-6">
      <Panel title={`Wishlist (${wishlist?.length ?? 0})`} aside={wishlist?.length ? <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(wishlist.map((w) => `1 ${w.name}`).join("\n"))}>copy as list</Button> : undefined}>
        {!wishlist?.length && <p className="text-[18px] text-muted">Empty. Add cards from a build&apos;s EDHREC wishlist.</p>}
        <ul className="grid gap-[2px] md:grid-cols-2">
          {wishlist?.map((w) => (
            <li key={w.name} className="flex items-center justify-between gap-2 px-2 py-1 text-[18px] hover:bg-navy-600">
              <span className="truncate">
                {w.name}
                <span className="ml-2 text-[13px] text-muted">{w.forDeck}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => db.wishlist.delete(w.name)} aria-label={`Remove ${w.name}`}>✕</Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
