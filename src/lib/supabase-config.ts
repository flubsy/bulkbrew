"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account settings that every page needs, without the Supabase library itself (about 57 KB
 * gzipped). Pages load the client only when it's needed: a session to restore, a sign-in, a
 * share. See loadSupabase(); src/lib/supabase.ts holds the client and the account calls.
 *
 * Accounts are optional. Without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app
 * runs exactly as before (data on this device only) and the account UI explains how to enable it.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The Vercel integration sets the anon key; newer Supabase projects and templates call it the
// "publishable" key under a few names. Each must be written out in full so Next inlines it at build.
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

export const accountsConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

/** Which of the two settings this build is missing (names only, for the Account page). */
export const missingAccountEnv = [
  !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
  !SUPABASE_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
].filter(Boolean) as string[];

/** Which sign-in buttons to show. Each must also be enabled in Supabase → Authentication → Providers. */
export const AUTH_PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "google,email")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  discord: "Discord",
  github: "GitHub",
  email: "email",
};

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
export const MIN_PASSWORD = 8;

/** Where supabase-js keeps the session (see the client options in supabase.ts). */
export const AUTH_STORAGE_KEY = "deckbit.auth";
/** Fired once when the Supabase client is first created, so the sync provider can attach to it. */
export const CLIENT_EVENT = "deckbit:supabase";

/** A saved session on this device, or a sign-in / reset redirect being completed: worth loading the client. */
export function authPending(): boolean {
  if (typeof window === "undefined" || !accountsConfigured) return false;
  try { if (localStorage.getItem(AUTH_STORAGE_KEY)) return true; } catch { /* ignore */ }
  return /[?&#](code|access_token|error_description)=/.test(window.location.search + window.location.hash);
}

/** The Supabase client, loading the library on first use (null when accounts aren't configured). */
export async function loadSupabase(): Promise<SupabaseClient | null> {
  if (!accountsConfigured) return null;
  return (await import("./supabase")).supabase();
}
