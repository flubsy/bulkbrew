"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { accountsConfigured, authPending, CLIENT_EVENT, loadSupabase } from "@/lib/supabase-config";
import { hasLocalData, lastSync, linkDevice, linkedUser, pendingCount, syncNow } from "@/lib/sync";

export interface AccountUser {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  avatar?: string;
  provider?: string;
}

interface SyncState {
  configured: boolean;
  ready: boolean;
  user: AccountUser | null;
  status: "idle" | "syncing" | "error";
  error?: string;
  lastSync?: number;
  pending: number;
  /** This device holds another account's data: ask before mixing. */
  needsLink: boolean;
  sync: () => Promise<void>;
  link: (mode: "merge" | "replace") => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SyncState>({
  configured: false, ready: true, user: null, status: "idle", pending: 0, needsLink: false,
  sync: async () => {}, link: async () => {}, signOut: async () => {},
});

export const useAccount = () => useContext(Ctx);

function toUser(s: Session | null): AccountUser | null {
  const u = s?.user;
  if (!u) return null;
  const m = (u.user_metadata ?? {}) as Record<string, string>;
  return { id: u.id, email: u.email, username: m.username, name: m.username ?? m.full_name ?? m.name ?? m.user_name, avatar: m.avatar_url ?? m.picture, provider: u.app_metadata?.provider as string | undefined };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  // Ready straight away unless there's a session to restore: signed-out visitors never load Supabase.
  const [ready, setReady] = useState(!accountsConfigured);
  const [status, setStatus] = useState<SyncState["status"]>("idle");
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<number>();
  const [pending, setPending] = useState(0);
  const [needsLink, setNeedsLink] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => setPending(await pendingCount()), []);

  const sync = useCallback(async () => {
    if (!user || needsLink) return;
    const sb = await loadSupabase();
    if (!sb) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setStatus("syncing");
    try {
      const r = await syncNow(sb, user.id);
      setLast(r.at);
      setError(undefined);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setStatus("error");
    }
    await refreshPending();
  }, [user, needsLink, refreshPending]);

  // Auth state. The Supabase library (~57 KB gzipped) loads only when there's a saved session or
  // a sign-in redirect to finish, or once another part of the app (the Account page, sharing)
  // creates the client; then we attach to it.
  useEffect(() => {
    if (!accountsConfigured) return;
    let alive = true;
    let unsub: (() => void) | undefined;
    let started = false;
    const attach = async () => {
      if (started) return;
      started = true;
      const sb = await loadSupabase();
      if (!sb || !alive) return;
      const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(toUser(session)));
      unsub = () => sub.subscription.unsubscribe();
      const { data } = await sb.auth.getSession();
      if (alive) { setUser(toUser(data.session)); setReady(true); }
    };
    const onClient = () => void attach();
    window.addEventListener(CLIENT_EVENT, onClient);
    if (authPending()) void attach();
    else setTimeout(() => { if (alive) setReady(true); }, 0);
    return () => { alive = false; unsub?.(); window.removeEventListener(CLIENT_EVENT, onClient); };
  }, []);

  // On sign-in: link this device, then sync.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const linked = await linkedUser();
      if (linked !== user.id) {
        if (linked && (await hasLocalData())) { if (alive) setNeedsLink(true); return; }
        await linkDevice(user.id, "merge"); // first account on this device: keep and upload what's here
      }
      if (!alive) return;
      setNeedsLink(false);
      setLast(await lastSync(user.id));
      await refreshPending();
    })();
    return () => { alive = false; };
  }, [user, refreshPending]);

  // Background sync: soon after local changes, when the tab regains focus, and every 2 minutes.
  useEffect(() => {
    if (!user || needsLink) return;
    const t0 = setTimeout(() => void sync(), 0);
    const onDirty = () => {
      void refreshPending();
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void sync(), 3000);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("deckbit:dirty", onDirty);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(() => void sync(), 120_000);
    return () => {
      clearTimeout(t0);
      if (debounce.current) clearTimeout(debounce.current);
      window.removeEventListener("deckbit:dirty", onDirty);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [user, needsLink, sync, refreshPending]);

  const link = useCallback(async (mode: "merge" | "replace") => {
    if (!user) return;
    await linkDevice(user.id, mode);
    setNeedsLink(false);
  }, [user]);

  const signOut = useCallback(async () => {
    await (await loadSupabase())?.auth.signOut();
    setUser(null);
    setStatus("idle");
  }, []);

  return (
    <Ctx.Provider value={{ configured: accountsConfigured, ready, user, status, error, lastSync: last, pending, needsLink, sync, link, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
