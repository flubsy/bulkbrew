"use client";

import { createClient, type Provider, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Accounts are optional. Without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app
 * runs exactly as before (data on this device only) and the account UI explains how to enable it.
 * The anon key is safe to expose: Row Level Security (supabase/schema.sql) limits every user to
 * their own rows.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The Vercel integration sets the anon key; newer Supabase projects and templates call it the
// "publishable" key under a few names. Each must be written out in full so Next inlines it at build.
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

export const accountsConfigured = !!(URL && KEY);

/** Which of the two settings this build is missing (names only, for the Account page). */
export const missingAccountEnv = [
  !URL && "NEXT_PUBLIC_SUPABASE_URL",
  !KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
].filter(Boolean) as string[];

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
  email: "email",
};

export async function signInWith(provider: Provider) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/account` } });
  if (error) throw error;
}


/* ----------------------------- username + password accounts ----------------------------- */

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
export const MIN_PASSWORD = 8;

/** Turn Supabase's error wording into something a player can act on. */
function friendly(e: { message: string }): Error {
  const m = e.message;
  if (/invalid login credentials/i.test(m)) return new Error("Wrong username/email or password.");
  if (/already registered|already exists/i.test(m)) return new Error("There's already an account with that email. Sign in instead, or reset the password.");
  if (/database error saving new user/i.test(m)) return new Error("That username was just taken. Pick another.");
  if (/function .* does not exist|schema cache/i.test(m)) return new Error("Username accounts aren't switched on yet: run supabase/schema.sql again in Supabase.");
  if (/email not confirmed/i.test(m)) return new Error("This email hasn't been confirmed. In Supabase, turn off Authentication → Email → Confirm email.");
  return new Error(m);
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { data, error } = await sb.rpc("username_available", { p_username: username });
  if (error) throw friendly(error);
  return !!data;
}

/** Create an account. Returns true when signed straight in (email confirmation off, as intended). */
export async function signUp(username: string, email: string, password: string): Promise<boolean> {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  if (!USERNAME_RE.test(username)) throw new Error("Usernames are 3–24 letters, numbers, _ . or -");
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for the password.`);
  if (!(await usernameAvailable(username))) throw new Error("That username is taken.");
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: `${window.location.origin}/account` } });
  if (error) throw friendly(error);
  // Supabase returns a user with no identities when the email already has an account.
  if (data.user && data.user.identities?.length === 0) throw new Error("There's already an account with that email. Sign in instead, or reset the password.");
  return !!data.session;
}

/** Sign in with a username or an email, plus password. */
export async function signInWithPassword(login: string, password: string) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  let email = login.trim();
  if (!email.includes("@")) {
    const { data, error } = await sb.rpc("login_email", { p_username: email, p_password: password });
    if (error) throw friendly(error);
    if (!data) throw new Error("Wrong username/email or password.");
    email = data as string;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
}

/** Email a reset link. It opens /account?reset=1, where the new password is set. */
export async function sendPasswordReset(email: string) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account?reset=1` });
  if (error) throw friendly(error);
}

export async function updatePassword(password: string) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for the password.`);
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw friendly(error);
}

/** Choose or change the username (e.g. for an account made with Google). */
export async function setUsername(username: string) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.rpc("set_username", { p_username: username });
  if (error) throw friendly(error);
  const { error: e2 } = await sb.auth.updateUser({ data: { username } });
  if (e2) throw friendly(e2);
}
