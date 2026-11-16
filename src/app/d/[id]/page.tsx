import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { SharedDeck } from "@/components/shared-deck";
import type { BuiltDeck } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

/**
 * The shared deck, read on the server for link previews (Discord, Reddit, iMessage, search).
 * Cached for hours: a preview doesn't need to be up to the minute, and it keeps the link's view
 * count (get_shared_deck counts each read) from ticking for every crawler.
 */
async function sharedDeckForPreview(id: string): Promise<BuiltDeck | null> {
  "use cache";
  cacheLife("hours");
  if (!SUPABASE_URL || !SUPABASE_KEY || !/^[A-Za-z0-9_-]{4,40}$/.test(id)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared_deck`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as BuiltDeck | null) ?? null;
  } catch {
    return null;
  }
}

const artCrop = (id: string) => `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;

export async function generateMetadata({ params }: PageProps<"/d/[id]">): Promise<Metadata> {
  const { id } = await params;
  const deck = await sharedDeckForPreview(id);
  if (!deck?.commanders?.length) return { title: "Shared deck", description: "A Magic deck shared from Deckbit." };
  const commanders = deck.commanders.map((c) => c.name).join(" & ");
  const title = deck.name ? `${deck.name} (${commanders})` : `${commanders} Commander deck`;
  const bracket = deck.stats?.estimatedBracket ?? deck.options?.bracket;
  const bits = [
    bracket ? `Bracket ${bracket}` : null,
    deck.stats?.total ? `${deck.stats.total} cards` : null,
    deck.stats?.priceUsd ? `about $${Math.round(deck.stats.priceUsd)}` : null,
    deck.combos?.length ? `${deck.combos.length} combo${deck.combos.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const description = `${bits ? `${bits}. ` : ""}Built with Deckbit from the cards in a real collection.`;
  const art = deck.commanders[0].scryfallId;
  const images = art ? [{ url: artCrop(art), alt: deck.commanders[0].name }] : undefined; // else the site image
  return {
    title,
    description,
    alternates: { canonical: `/d/${id}` },
    openGraph: { type: "article", title, description, url: `/d/${id}`, ...(images && { images }) },
    twitter: { card: "summary_large_image", title, description, ...(images && { images: images.map((i) => i.url) }) },
  };
}

export default function SharedDeckPage({ params }: PageProps<"/d/[id]">) {
  return (
    <div className="py-8">
      <Suspense fallback={<p className="text-[18px] text-muted">Opening the deck…</p>}>
        {params.then(({ id }) => <SharedDeck id={id} />)}
      </Suspense>
    </div>
  );
}
