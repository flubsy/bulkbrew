import type { Metadata } from "next";
import { ReferenceDecks } from "@/components/reference-decks";

export const metadata: Metadata = { title: "Reference decks" };

export default function DecksPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Reference decks<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">
        Feed the builder real decklists. Cards that appear across the decks you add get a score boost — if you own them. Paste links from Moxfield, Archidekt, MTGGoldfish, Deckstats or TappedOut, or paste the list text.
      </p>
      <ReferenceDecks />
    </div>
  );
}
