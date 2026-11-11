"use client";

import { createClient, type Provider, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Accounts are optional. Without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app
 * runs exactly as before (data on this device only) and the account UI explains how to enable it.
 * The anon key is safe to expose: Row Level Security (supabase/schema.sql) limits every user to
 * their own rows.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The Vercel integration sets the anon key; newer Supabase projects call it the "publishable" key.
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const accountsConfigured = !!(URL && KEY);

/** Which sign-in buttons to show. Each must also be enabled in Supabase → Authentication → Providers. */
export const AUTH_PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "google,email")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!accountsConfigured) return null;
  if (!client) {
    client = createClient(URL!, KEY!, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "deckbit.auth" },
    });
  }
  return client;
}

export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  discord: "Discord",
  github: "GitHub",
  email: "email link",
};

export async function signInWith(provider: Provider) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/account` } });
  if (error) throw error;
}

export async function signInWithEmail(email: string) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/account` } });
  if (error) throw error;
}
