import type { Metadata } from "next";
import { DeckCompare } from "@/components/deck-compare";
import { SavedTabs } from "@/components/nav";

export const metadata: Metadata = { title: "Compare decks" };

export default function ComparePage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Compare<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">Two decks side by side: power, combos, roles, curve, playstyle and the cards they share. Saved decks, links, or EDHREC&apos;s average list for the bracket.</p>
      <SavedTabs />
      <DeckCompare />
    </div>
  );
}
