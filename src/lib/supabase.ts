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
  email: "email",
};

export async function signInWith(provider: Provider) {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/account` } });
  if (error) throw error;
}

function authClient() {
  const sb = supabase();
  if (!sb) throw new Error("Accounts aren't set up on this server.");
  return sb;
}

const back = () => `${window.location.origin}/account`;

/** Turn Supabase's auth errors into something a player can act on. */
export function friendlyAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again, or use “Forgot password?” or an email code.";
  if (m.includes("email not confirmed")) return "Your email isn't confirmed yet. Enter the 6-digit code from the email we sent, or send a new one.";
  if (m.includes("already registered") || m.includes("already been registered")) return "There's already an account with that email. Sign in instead, or use “Forgot password?”.";
  if (m.includes("password should be") || m.includes("weak password")) return "Pick a longer password: at least 8 characters.";
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("invalid or has expired") || m.includes("invalid token")) return "That code or link has expired or was already used. Send a new code and type it in here.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Too many emails sent in a short time. Wait a minute and try again, or sign in with Google.";
  if (m.includes("code verifier") || m.includes("flow state")) return "That link was opened in a different browser from the one you signed up in. Use the 6-digit code instead.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "That sign-in option isn't switched on in Supabase yet.";
  return msg || "Something went wrong signing in.";
}

/** Errors Supabase appends to the redirect URL (?error=… or #error=…) after a failed link. */
export function readAuthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("error_code") ?? hash.get("error_code");
  const desc = params.get("error_description") ?? hash.get("error_description");
  if (!code && !desc && !params.get("error") && !hash.get("error")) return null;
  // Clean the address bar so a refresh doesn't show the error again.
  window.history.replaceState(null, "", window.location.pathname);
  if (code === "otp_expired") return "That email link had already been used or expired, often because the email app opened it first or it was opened in another browser. Sign in with your password or an email code below instead.";
  return friendlyAuthError(desc ?? code ?? "Sign-in failed");
}

/** Email + password: create an account. Returns whether a confirmation code/link was emailed. */
export async function signUpWithPassword(email: string, password: string, name?: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await authClient().auth.signUp({ email, password, options: { emailRedirectTo: back(), data: name ? { full_name: name } : undefined } });
  if (error) throw error;
  // With email confirmation on, an existing address comes back with no identities instead of an error.
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error("User already registered");
  return { needsConfirm: !data.session };
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await authClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Email a one-time sign-in code (and link). Creates the account if it doesn't exist yet. */
export async function sendEmailCode(email: string) {
  const { error } = await authClient().auth.signInWithOtp({ email, options: { emailRedirectTo: back(), shouldCreateUser: true } });
  if (error) throw error;
}

/** Verify a 6-digit code from either the sign-in email or the confirm-signup email. */
export async function verifyEmailCode(email: string, code: string) {
  const token = code.replace(/D/g, "");
  const sb = authClient();
  let { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) ({ error } = await sb.auth.verifyOtp({ email, token, type: "signup" }));
  if (error) throw error;
}

export async function resendConfirmation(email: string) {
  const { error } = await authClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: back() } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await authClient().auth.resetPasswordForEmail(email, { redirectTo: `${back()}?reset=1` });
  if (error) throw error;
}

export async function updateAccount(changes: { password?: string; name?: string }) {
  const { error } = await authClient().auth.updateUser({ password: changes.password, data: changes.name !== undefined ? { full_name: changes.name } : undefined });
  if (error) throw error;
}
