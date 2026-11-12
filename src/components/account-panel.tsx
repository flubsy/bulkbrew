"use client";

import { useEffect, useState } from "react";
import { PROVIDER_LABEL, missingAccountEnv, supabase } from "@/lib/supabase";
import { AccountSettings, AuthForms, NewPasswordForm } from "./auth-forms";
import { deleteCloudData, wipeLocal } from "@/lib/sync";
import { useAccount } from "./sync-provider";
import { Button, Notice, Panel } from "./ui";

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
  const [resetting, setResetting] = useState(false);
  // Opened from a password-reset email (/account?reset=1): the link signs you in, then you pick a new password.
  useEffect(() => {
    const t = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("reset") === "1") setResetting(true);
    }, 0);
    const sub = supabase()?.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setResetting(true); });
    return () => { clearTimeout(t); sub?.data.subscription.unsubscribe(); };
  }, []);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!acct.configured) {
    return (
      <Panel title="Accounts aren't switched on yet">
        <p className="text-[18px] text-cream-dim">Right now everything is saved in this browser only. Accounts need a free Supabase project; the steps are in <code>docs/ACCOUNTS.md</code> in the repo.</p>
        {missingAccountEnv.length > 0 && (
          <div className="mt-3"><Notice tone="warn">
            This deployment was built without {missingAccountEnv.join(" and ")}. In Vercel → Settings → Environment Variables, make sure {missingAccountEnv.length > 1 ? "they're" : "it's"} ticked for <b>Preview</b> as well as Production, then redeploy (these are read at build time, so an old deployment won&apos;t pick them up).
          </Notice></div>
        )}
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
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  if (!acct.user) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <AuthForms />
        <Panel title="What gets saved">
          <ul className="grid list-disc gap-2 pl-6 text-[17px] text-cream-dim">
            <li>Your collection, saved and upgraded decks, reference decks and wishlist, on every device you sign in on.</li>
            <li>Your email is only used to reset your password. No newsletters, no verification step.</li>
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

      {resetting && <NewPasswordForm onDone={() => { setResetting(false); window.history.replaceState(null, "", "/account"); }} />}

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

      <AccountSettings key={u.username ?? ""} username={u.username} />

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
