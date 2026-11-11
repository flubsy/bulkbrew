"use client";

import type { Provider } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { AUTH_PROVIDERS, friendlyAuthError, PROVIDER_LABEL, readAuthErrorFromUrl, resendConfirmation, sendEmailCode, sendPasswordReset, signInWith, signInWithPassword, signUpWithPassword, supabase, updateAccount, verifyEmailCode } from "@/lib/supabase";
import { deleteCloudData, wipeLocal } from "@/lib/sync";
import { useAccount } from "./sync-provider";
import { Button, Input, Notice, Panel } from "./ui";

function ago(t?: number) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export function AccountPanel() {
  const acct = useAccount();
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  // A failed email link lands here with ?error=…/#error=…; a reset link with ?reset=1.
  useEffect(() => {
    const t = setTimeout(() => {
      const isReset = new URLSearchParams(window.location.search).get("reset") === "1";
      const err = readAuthErrorFromUrl();
      if (err) setMsg({ tone: "error", text: err });
      if (isReset) setResetMode(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!acct.configured) {
    return (
      <Panel title="Accounts aren't switched on yet">
        <p className="text-[18px] text-cream-dim">Right now everything is saved in this browser only. Accounts need a free Supabase project; the steps are in <code>docs/ACCOUNTS.md</code> in the repo.</p>
        <p className="mt-3 text-[16px] text-muted">Until then, move data between devices with Collection → &ldquo;Download everything&rdquo; and &ldquo;Restore from backup&rdquo;.</p>
      </Panel>
    );
  }
  if (!acct.ready) return <Notice>Checking your sign-in…</Notice>;

  async function go(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!acct.user) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <SignInPanel initialMessage={msg} />
        <Panel title="What gets saved">
          <ul className="grid list-disc gap-2 pl-6 text-[17px] text-cream-dim">
            <li>Your collection, saved and upgraded decks, reference decks and wishlist.</li>
            <li>Nothing else: no card prices you didn&apos;t import, no browsing history.</li>
            <li>Only you can read your data. The database enforces it per account.</li>
            <li>Whatever&apos;s already on this device gets added to your account the first time you sign in.</li>
          </ul>
        </Panel>
      </div>
    );
  }

  const u = acct.user;
  return (
    <div className="grid gap-5">
      {acct.needsLink && (
        <Panel tone="gold" title="This device has someone else's data">
          <p className="text-[18px] text-cream-dim">The cards and decks here were last synced with a different account. What should happen to them?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => go(() => acct.link("merge"), "Merged. Syncing now.")} disabled={busy}>Add them to my account</Button>
            <Button variant="ghost" onClick={() => go(() => acct.link("replace"), "Replaced with your account's data.")} disabled={busy}>Replace them with my account&apos;s data</Button>
          </div>
        </Panel>
      )}

      <Panel title="Account">
        <div className="flex items-center gap-4">
          {u.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatar} alt="" width={56} height={56} className="px-border h-14 w-14" style={{ imageRendering: "auto" }} referrerPolicy="no-referrer" />
          ) : (
            <span className="px-border flex h-14 w-14 items-center justify-center bg-navy-600 font-pixel text-[22px]">{(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}</span>
          )}
          <div>
            <div className="text-[20px] text-cream">{u.name ?? u.email}</div>
            <div className="text-[15px] text-muted">{u.email}{u.provider ? ` · via ${PROVIDER_LABEL[u.provider] ?? u.provider}` : ""}</div>
          </div>
        </div>
      </Panel>

      <ProfilePanel name={u.name ?? ""} provider={u.provider} resetMode={resetMode} onDone={() => setResetMode(false)} />

      <Panel title="Sync">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="bg-navy-900 px-3 py-2"><div className="px-label mb-1">Status</div><div className="font-pixel text-[16px]">{acct.status === "syncing" ? "Syncing…" : acct.status === "error" ? <span className="text-red">Error</span> : acct.pending ? <span className="text-gold">Waiting</span> : <span className="text-green">Up to date</span>}</div></div>
          <div className="bg-navy-900 px-3 py-2"><div className="px-label mb-1">Last sync</div><div className="font-pixel text-[16px]">{ago(acct.lastSync)}</div></div>
          <div className="bg-navy-900 px-3 py-2"><div className="px-label mb-1">Pending changes</div><div className="font-pixel text-[16px]">{acct.pending}</div></div>
        </div>
        {acct.error && <div className="mt-3"><Notice tone="error">{acct.error}</Notice></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => go(acct.sync)} disabled={busy || acct.status === "syncing" || acct.needsLink}>Sync now</Button>
        </div>
        <p className="mt-3 text-[15px] text-muted">Changes upload a few seconds after you make them and download when you come back to the tab. Works offline; it catches up when you reconnect.</p>
      </Panel>

      <Panel title="Sign out & data">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => go(acct.signOut)} disabled={busy}>Sign out (keep data on this device)</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
            if (!confirm("Sign out and remove your cards and decks from this device? They stay in your account.")) return;
            void go(async () => {
              await acct.sync(); // upload anything not yet synced first
              const id = u.id;
              await acct.signOut();
              await wipeLocal(id);
            }, "Signed out and cleared this device.");
          }}>Sign out and clear this device</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
            if (!confirm("Permanently delete your cloud copy? Data on this device stays, but other devices won't get it any more. This can't be undone.")) return;
            void go(async () => { const sb = supabase(); if (sb) await deleteCloudData(sb); }, "Cloud copy deleted.");
          }}>Delete my cloud copy</Button>
        </div>
        {msg && <div className="mt-4"><Notice tone={msg.tone === "info" ? "info" : msg.tone}>{msg.text}</Notice></div>}
      </Panel>
    </div>
  );
}

/* ----------------------------- signed out ----------------------------- */

type Mode = "password" | "code";
type Msg = { tone: "ok" | "error" | "info"; text: string } | null;

function SignInPanel({ initialMessage }: { initialMessage: Msg }) {
  const oauth = AUTH_PROVIDERS.filter((p) => p !== "email");
  const emailOn = AUTH_PROVIDERS.includes("email");
  const [mode, setMode] = useState<Mode>("password");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [dismissedInitial, setDismissedInitial] = useState(false);
  const shown = msg ?? (dismissedInitial ? null : initialMessage);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    setDismissedInitial(true);
    try {
      await fn();
    } catch (e) {
      const text = friendlyAuthError(e);
      setMsg({ tone: "error", text });
      // An unconfirmed account can finish signing up with the emailed code.
      if (text.includes("isn't confirmed")) {
        setMode("code");
        setCodeSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    setMsg(null);
    setDismissedInitial(true);
  };

  return (
    <Panel title="Sign in">
      <p className="text-[18px] text-cream-dim">Keep your collection, saved decks and wishlist on every device: your phone, a work PC, a friend&apos;s laptop.</p>

      {oauth.length > 0 && (
        <div className="mt-4 grid gap-2">
          {oauth.map((p) => (
            <Button key={p} onClick={() => run(() => signInWith(p as Provider))} disabled={busy}>
              Continue with {PROVIDER_LABEL[p] ?? p}
            </Button>
          ))}
        </div>
      )}

      {emailOn && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Email sign-in method">
            <button type="button" className="px-chip px-border" aria-pressed={mode === "password"} onClick={() => switchMode("password")}>Email &amp; password</button>
            <button type="button" className="px-chip px-border" aria-pressed={mode === "code"} onClick={() => switchMode("code")}>Email code</button>
          </div>

          {mode === "password" ? (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (creating) {
                    const { needsConfirm } = await signUpWithPassword(email, password, name.trim() || undefined);
                    if (needsConfirm) {
                      setMode("code");
                      setCodeSent(true);
                      setMsg({ tone: "ok", text: `Account created. We've emailed a 6-digit code to ${email}. Type it below to confirm.` });
                    }
                  } else {
                    await signInWithPassword(email, password);
                  }
                });
              }}
            >
              {creating && (
                <div>
                  <label htmlFor="acct-name" className="px-label">Display name</label>
                  <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" placeholder="What your friends call you" />
                </div>
              )}
              <div>
                <label htmlFor="acct-email" className="px-label">Email</label>
                <Input id="acct-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="acct-pw" className="px-label">Password</label>
                <Input id="acct-pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? "new-password" : "current-password"} aria-describedby="acct-pw-hint" />
                <p id="acct-pw-hint" className="mt-1 text-[14px] text-muted">At least 8 characters.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || !email || password.length < 8}>{creating ? "Create account" : "Sign in"}</Button>
                <button type="button" className="text-[16px] text-cream-dim underline underline-offset-4 hover:text-cream" onClick={() => { setCreating((c) => !c); setMsg(null); }}>
                  {creating ? "I already have an account" : "New here? Create an account"}
                </button>
              </div>
              {!creating && (
                <button
                  type="button"
                  className="justify-self-start text-[15px] text-muted underline underline-offset-4 hover:text-cream disabled:no-underline"
                  disabled={busy || !email}
                  onClick={() => run(async () => {
                    await sendPasswordReset(email);
                    setMsg({ tone: "ok", text: `If ${email} has an account, a reset link is on its way. Open it in this same browser.` });
                  })}
                >
                  Forgot password?{email ? "" : " Enter your email first."}
                </button>
              )}
            </form>
          ) : (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!codeSent) {
                    await sendEmailCode(email);
                    setCodeSent(true);
                    setMsg({ tone: "ok", text: `Code sent to ${email}. It can take a minute, so check spam too.` });
                  } else {
                    await verifyEmailCode(email, code);
                  }
                });
              }}
            >
              <p className="text-[16px] text-cream-dim">No password needed. We email you a 6-digit code to type in here, so it works even if you read the email on another device.</p>
              <div>
                <label htmlFor="acct-email2" className="px-label">Email</label>
                <Input id="acct-email2" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setCodeSent(false); }} autoComplete="email" />
              </div>
              {codeSent && (
                <div>
                  <label htmlFor="acct-code" className="px-label">6-digit code</label>
                  <Input id="acct-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || !email || (codeSent && code.replace(/\D/g, "").length < 6)}>{codeSent ? "Sign in" : "Email me a code"}</Button>
                {codeSent && (
                  <button
                    type="button"
                    className="text-[16px] text-cream-dim underline underline-offset-4 hover:text-cream"
                    disabled={busy}
                    onClick={() => run(async () => {
                      await sendEmailCode(email).catch(() => resendConfirmation(email));
                      setMsg({ tone: "ok", text: "New code sent." });
                    })}
                  >
                    Send a new code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      <div className="mt-4" aria-live="polite">{shown && <Notice tone={shown.tone === "info" ? "info" : shown.tone}>{shown.text}</Notice>}</div>
    </Panel>
  );
}

/* ----------------------------- signed in: name & password ----------------------------- */

function ProfilePanel({ name, provider, resetMode, onDone }: { name: string; provider?: string; resetMode: boolean; onDone: () => void }) {
  const [display, setDisplay] = useState(name);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tone={resetMode ? "orange" : "default"} title={resetMode ? "Choose a new password" : "Profile"}>
      {!resetMode && (
        <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void run(() => updateAccount({ name: display.trim() }), "Name saved."); }}>
          <div>
            <label htmlFor="prof-name" className="px-label">Display name</label>
            <Input id="prof-name" value={display} onChange={(e) => setDisplay(e.target.value)} autoComplete="nickname" />
          </div>
          <Button type="submit" variant="ghost" disabled={busy || display.trim() === name}>Save name</Button>
        </form>
      )}
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { await updateAccount({ password: pw }); setPw(""); onDone(); }, "Password saved. You can now sign in with your email and password.");
        }}
      >
        <div>
          <label htmlFor="prof-pw" className="px-label">{resetMode ? "New password" : provider === "email" ? "Change password" : "Set a password (optional)"}</label>
          <Input id="prof-pw" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-describedby="prof-pw-hint" />
          <p id="prof-pw-hint" className="mt-1 text-[14px] text-muted">At least 8 characters. Lets you sign in with your email and password too.</p>
        </div>
        <Button type="submit" variant={resetMode ? "primary" : "ghost"} disabled={busy || pw.length < 8}>Save password</Button>
      </form>
      <div className="mt-3" aria-live="polite">{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}</div>
    </Panel>
  );
}
