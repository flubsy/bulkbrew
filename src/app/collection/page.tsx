import type { Metadata } from "next";
import { CollectionManager } from "@/components/collection-manager";

export const metadata: Metadata = {
  title: "Import your Magic collection",
  description: "Import a CSV or Excel export from ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield or TCGplayer. Your collection stays in your browser.",
  alternates: { canonical: "/collection" },
};

export default function CollectionPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Collection<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[20px] text-cream-dim">
        Upload a CSV or Excel export (ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, TCGplayer, or any sheet with a name column), paste a list, or copy cells straight out of Google Sheets. Everything stays in this browser.
      </p>
      <CollectionManager />
    </div>
  );
}
