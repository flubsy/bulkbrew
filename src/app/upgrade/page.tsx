import type { Metadata } from "next";
import { DeckUpgrader } from "@/components/deck-upgrader";
import { ANVIL, Sprite } from "@/components/sprites";

export const metadata: Metadata = { title: "Upgrade" };

export default function UpgradePage() {
  return (
    <div className="py-8">
      <div className="flex items-end gap-4">
        <h1 className="font-pixel text-[24px] text-cream">
          Upgrade<span className="text-orange">.</span>
        </h1>
        <Sprite grid={ANVIL} scale={3} className="mb-1" />
      </div>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">
        Bring a deck you already play (a Moxfield link, a pasted list or a saved build). BulkBrew finds the best swaps from cards sitting in your collection and explains every one.
      </p>
      <DeckUpgrader />
    </div>
  );
}
