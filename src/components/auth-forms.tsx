"use client";

import type { Provider } from "@supabase/supabase-js";
import { useState, type ReactNode } from "react";
import { AUTH_PROVIDERS, MIN_PASSWORD, PROVIDER_LABEL, USERNAME_RE, sendPasswordReset, setUsername, signInWith, signInWithPassword, signUp, updatePassword, usernameAvailable } from "@/lib/supabase";
import { Button, Input, Label, Notice, Panel } from "./ui";

type Msg = { tone: "ok" | "error" | "info"; text: string } | null;

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, setMsg, run };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <Input type={show ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} minLength={autoComplete === "new-password" ? MIN_PASSWORD : undefined} />
      <Button type="button" size="sm" variant="ghost" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}>{show ? "hide" : "show"}</Button>
    </div>
  );
}

/** Signed out: sign in (username or email + password), create an account, or reset a password. */
export function AuthForms() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [login, setLogin] = useState("");
  const [username, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [taken, setTaken] = useState<boolean | null>(null);
  const { busy, msg, setMsg, run } = useAction();
  const oauth = AUTH_PROVIDERS.filter((p) => p !== "email" && p !== "password");

  const switchTo = (m: typeof mode) => { setMode(m); setMsg(null); };

  async function checkName() {
    if (!USERNAME_RE.test(username)) { setTaken(null); return; }
    try { setTaken(!(await usernameAvailable(username))); } catch { setTaken(null); }
  }

  return (
    <Panel title={mode === "signup" ? "Create an account" : mode === "forgot" ? "Reset your password" : "Sign in"}>
      {mode !== "forgot" && (
        <div className="mb-4 flex gap-1">
          <button type="button" className="px-chip px-border" aria-pressed={mode === "signin"} onClick={() => switchTo("signin")}>Sign in</button>
          <button type="button" className="px-chip px-border" aria-pressed={mode === "signup"} onClick={() => switchTo("signup")}>Create account</button>
        </div>
      )}

      {mode === "signin" && (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => signInWithPassword(login, password)); }}>
          <Field label="Username or email">
            <Input required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !login || !password}>{busy ? "Signing in…" : "Sign in"}</Button>
            <button type="button" className="text-[16px] text-orange underline underline-offset-4" onClick={() => { setEmail(login.includes("@") ? login : ""); switchTo("forgot"); }}>Forgot password?</button>
          </div>
        </form>
      )}

      {mode === "signup" && (
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const signedIn = await signUp(username, email, password);
            return signedIn ? "Account created. You're signed in." : `Account created. Supabase still has email confirmation on, so check ${email} for a link (or turn it off: see docs/ACCOUNTS.md).`;
          });
        }}>
          <Field label="Username" hint="3–24 letters, numbers, _ . -">
            <Input required value={username} onChange={(e) => { setUser(e.target.value.trim()); setTaken(null); }} onBlur={checkName} autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_.\-]{3,24}" />
          </Field>
          {taken === true && <p className="-mt-2 text-[15px] text-orange">That username is taken.</p>}
          {taken === false && <p className="-mt-2 text-[15px] text-green">Available.</p>}
          <Field label="Email" hint="only used to reset your password">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password" hint={`at least ${MIN_PASSWORD} characters`}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <div>
            <Button type="submit" disabled={busy || !username || !email || password.length < MIN_PASSWORD || taken === true}>{busy ? "Creating…" : "Create account"}</Button>
          </div>
        </form>
      )}

      {mode === "forgot" && (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await sendPasswordReset(email); return `If ${email} has an account, a reset link is on its way. Open it on this device.`; }); }}>
          <p className="text-[17px] text-cream-dim">Enter the email you signed up with. You&apos;ll get a link to choose a new password.</p>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !email}>Send reset link</Button>
            <button type="button" className="text-[16px] text-orange underline underline-offset-4" onClick={() => switchTo("signin")}>Back to sign in</button>
          </div>
        </form>
      )}

      {msg && <div className="mt-4"><Notice tone={msg.tone === "info" ? "info" : msg.tone}>{msg.text}</Notice></div>}

      {oauth.length > 0 && mode !== "forgot" && (
        <div className="mt-5 border-t-4 border-navy-600 pt-4">
          <p className="px-label">Or</p>
          <div className="grid gap-2">
            {oauth.map((p) => (
              <Button key={p} variant="ghost" onClick={() => run(() => signInWith(p as Provider))} disabled={busy}>
                Continue with {PROVIDER_LABEL[p] ?? p}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Shown after opening a reset link (signed in by the link): choose the new password. */
export function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const { busy, msg, run } = useAction();
  return (
    <Panel tone="gold" title="Choose a new password">
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await updatePassword(password); setTimeout(onDone, 1500); return "Password changed."; }); }}>
        <Field label="New password" hint={`at least ${MIN_PASSWORD} characters`}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <div><Button type="submit" disabled={busy || password.length < MIN_PASSWORD}>Save password</Button></div>
      </form>
      {msg && <div className="mt-4"><Notice tone={msg.tone === "info" ? "info" : msg.tone}>{msg.text}</Notice></div>}
    </Panel>
  );
}

/** Signed in: username (pick one if the account came from Google/Discord) and password change. */
export function AccountSettings({ username }: { username?: string }) {
  const [name, setName] = useState(username ?? "");
  const [password, setPassword] = useState("");
  const names = useAction();
  const pw = useAction();
  return (
    <Panel title="Sign-in details">
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void names.run(async () => { await setUsername(name); return "Username saved. You can sign in with it now."; }); }}>
        <Field label="Username" hint={username ? undefined : "pick one to sign in without Google"}>
          <div className="flex gap-2">
            <Input required value={name} onChange={(e) => setName(e.target.value.trim())} autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_.\-]{3,24}" />
            <Button type="submit" size="sm" variant="ghost" disabled={names.busy || !name || name === username}>save</Button>
          </div>
        </Field>
      </form>
      {names.msg && <div className="mt-2"><Notice tone={names.msg.tone === "info" ? "info" : names.msg.tone}>{names.msg.text}</Notice></div>}
      <form className="mt-4 grid gap-2" onSubmit={(e) => { e.preventDefault(); void pw.run(async () => { await updatePassword(password); setPassword(""); return "Password changed."; }); }}>
        <Field label={username ? "Change password" : "Set a password"} hint={`at least ${MIN_PASSWORD} characters`}>
          <div className="flex gap-2">
            <div className="flex-1"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></div>
            <Button type="submit" size="sm" variant="ghost" disabled={pw.busy || password.length < MIN_PASSWORD}>save</Button>
          </div>
        </Field>
      </form>
      {pw.msg && <div className="mt-2"><Notice tone={pw.msg.tone === "info" ? "info" : pw.msg.tone}>{pw.msg.text}</Notice></div>}
    </Panel>
  );
}
