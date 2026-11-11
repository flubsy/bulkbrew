import type { Metadata } from "next";
import { SavedTabs } from "@/components/nav";
import { SavedDecks } from "@/components/saved-decks";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Saved<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">Every deck you&apos;ve built, rolled or upgraded. Sign in to see them on all your devices.</p>
      <SavedTabs />
      <SavedDecks />
    </div>
  );
}
