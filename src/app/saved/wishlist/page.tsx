import type { Metadata } from "next";
import { SavedTabs } from "@/components/nav";
import { Wishlist } from "@/components/wishlist";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Wishlist<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[19px] text-cream-dim">Cards EDHREC suggested for your decks that you don&apos;t own yet.</p>
      <SavedTabs />
      <Wishlist />
    </div>
  );
}
