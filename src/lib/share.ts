"use client";

import { supabase } from "./supabase";
import type { BuiltDeck } from "./types";

/**
 * Public deck links: /d/<id>. Stored in Supabase (shared_decks, see supabase/schema.sql) through
 * two functions; works signed in or not. Signed-in owners re-sharing a deck update the same link.
 */

export const sharingAvailable = () => !!supabase();

/** What goes public: the list, stats, primer, combos and upgrade notes. Not your bench (that's your collection) or private lists. */
function publicCopy(deck: BuiltDeck): BuiltDeck {
  return {
    ...deck,
    alternatives: [],
    options: { ...deck.options, excludeCards: [], includeCards: [], referenceDeckIds: [] },
    inUse: undefined,
    shareId: undefined,
  };
}

export async function shareDeck(deck: BuiltDeck): Promise<string> {
  const sb = supabase();
  if (!sb) throw new Error("Sharing needs accounts set up on this server.");
  const { data, error } = await sb.rpc("share_deck", { p_data: publicCopy(deck), p_id: deck.shareId ?? null });
  if (error) throw new Error(/function .* does not exist|schema cache/i.test(error.message) ? "Sharing isn't switched on yet: run supabase/schema.sql again in Supabase." : error.message);
  return data as string;
}

export async function loadSharedDeck(id: string): Promise<BuiltDeck | null> {
  const sb = supabase();
  if (!sb) throw new Error("Sharing isn't set up on this server.");
  const { data, error } = await sb.rpc("get_shared_deck", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as BuiltDeck | null) ?? null;
}

export function shareUrl(id: string) {
  return `${window.location.origin}/d/${id}`;
}
