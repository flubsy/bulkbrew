import type { Metadata } from "next";
import { SavedDecks } from "@/components/saved-decks";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Saved<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">Decks you&apos;ve built and cards you&apos;re hunting for. Stored on this device; use Backup on the Collection page to move them.</p>
      <SavedDecks />
    </div>
  );
}
