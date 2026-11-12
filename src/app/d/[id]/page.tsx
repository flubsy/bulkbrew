import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedDeck } from "@/components/shared-deck";

export const metadata: Metadata = { title: "Shared deck", description: "A Magic deck shared from BulkBrew." };

export default function SharedDeckPage({ params }: PageProps<"/d/[id]">) {
  return (
    <div className="py-8">
      <Suspense fallback={<p className="text-[18px] text-muted">Opening the deck…</p>}>
        {params.then(({ id }) => <SharedDeck id={id} />)}
      </Suspense>
    </div>
  );
}
