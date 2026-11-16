import type { Metadata } from "next";
import { DeckBuilder } from "@/components/deck-builder";

export const metadata: Metadata = {
  title: "Build a Commander deck from your collection",
  description: "Pick a commander, theme, bracket and budget: Deckbit builds the strongest 100-card Commander deck from the cards you own, scored against EDHREC and Commander Spellbook.",
  alternates: { canonical: "/build" },
};

export default function BuildPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Build<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">Every option below only ever draws from your collection.</p>
      <DeckBuilder />
    </div>
  );
}
