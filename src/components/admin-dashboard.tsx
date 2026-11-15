"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRACKETS, FORMATS, THEMES } from "@/lib/types";
import { useAccount } from "./sync-provider";
import { Button, Notice, Panel, Stat } from "./ui";

/**
 * Admin-only usage dashboard. All numbers come from one database function, admin_stats(),
 * which refuses anyone not listed in public.admins (see supabase/schema.sql). It returns only
 * totals and top lists, and a name is only listed once 2+ different people have it.
 */

type Ranked = { name: string; decks?: number; people: number; copies?: number };
interface Stats {
  generatedAt: string;
  users: { total: number; new7: number; new30: number; active7: number; active30: number; withUsername: number; byProvider: Record<string, number> };
  decks: { total: number; upgrades: number; markedBuilt: number; aiBuilt: number; avgPower: number | null; perWeek: { week: string; n: number }[]; byBracket: Record<string, number>; byFormat: Record<string, number> };
  topCommanders: Ranked[];
  topCards: Ranked[];
  topThemes: Ranked[];
  collections: { people: number; totalCards: number; medianUnique: number | null; mostOwned: Ranked[] };
  topWishlist: Ranked[];
  shares: { total: number; views: number; last30: number };
}

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;
const PROVIDER: Record<string, string> = { google: "Google", discord: "Discord", email: "Username / email", github: "GitHub", apple: "Apple" };
const n = (x: number | null | undefined) => (x ?? 0).toLocaleString();

export function AdminDashboard() {
  const acct = useAccount();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "denied" } | { kind: "error"; message: string } | { kind: "ok"; stats: Stats }>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const sb = supabase();
    if (!sb || !acct.user) return;
    let alive = true;
    (async () => {
      const { data: isAdmin } = await sb.rpc("is_admin");
      if (!alive) return;
      if (!isAdmin) { setState({ kind: "denied" }); return; }
      const { data, error } = await sb.rpc("admin_stats");
      if (!alive) return;
      if (error) setState({ kind: "error", message: /does not exist|schema cache/i.test(error.message) ? "The dashboard isn't set up in the database yet: run supabase/schema.sql again in Supabase." : error.message });
      else setState({ kind: "ok", stats: data as Stats });
    })();
    return () => { alive = false; };
  }, [acct.user, nonce]);

  if (!acct.configured || (acct.ready && !acct.user) || state.kind === "denied") return <p className="text-[18px] text-muted">Nothing here.</p>;
  if (state.kind === "loading") return <Notice>Loading…</Notice>;
  if (state.kind === "error") return <Notice tone="error">{state.message}</Notice>;

  const s = state.stats;
  const maxWeek = Math.max(1, ...s.decks.perWeek.map((w) => w.n));
  const bracketTotal = Object.values(s.decks.byBracket).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-muted">
        <span>Updated {new Date(s.generatedAt).toLocaleString()}. Lists only show names that 2+ different people have.</span>
        <Button size="sm" variant="ghost" onClick={() => { setState({ kind: "loading" }); setNonce((x) => x + 1); }}>refresh</Button>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Accounts" value={n(s.users.total)} sub={`+${n(s.users.new7)} this week · +${n(s.users.new30)} in 30 days`} />
        <Stat label="Active" value={n(s.users.active7)} sub={`this week · ${n(s.users.active30)} in 30 days`} />
        <Stat label="Decks saved" value={n(s.decks.total)} sub={`${n(s.decks.upgrades)} upgrades · ${n(s.decks.markedBuilt)} marked built`} />
        <Stat label="Avg power" value={s.decks.avgPower ?? "–"} sub={`${n(s.shares.total)} shared links · ${n(s.shares.views)} views`} />
      </section>

      <Panel title="Decks saved per week">
        <div className="flex h-40 items-end gap-1 sm:gap-2" role="img" aria-label={`Decks saved per week, last 12 weeks: ${s.decks.perWeek.map((w) => w.n).join(", ")}`}>
          {s.decks.perWeek.map((w) => {
            const label = `Week of ${new Date(w.week).toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${w.n} deck${w.n === 1 ? "" : "s"}`;
            return (
              <div key={w.week} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={label}>
                <span className="text-[13px] text-cream-dim">{w.n || ""}</span>
                <div className="px-bar w-full group-hover:opacity-80" style={{ height: `${Math.max(w.n ? 4 : 2, (w.n / maxWeek) * 110)}px`, opacity: w.n ? 1 : 0.25 }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[13px] text-muted">
          <span>{new Date(s.decks.perWeek[0]?.week ?? s.generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
          <span>this week</span>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankPanel title="Most-built commanders" rows={s.topCommanders} unit="decks" empty="No commander has been built by 2+ people yet." />
        <RankPanel title="Most-played cards (not lands)" rows={s.topCards} unit="decks" empty="No card is in decks from 2+ people yet." />
        <RankPanel title="Themes picked" rows={s.topThemes.map((t) => ({ ...t, name: THEME_LABEL[t.name] ?? t.name }))} unit="decks" empty="No themes picked yet." />
        <Panel title="Brackets and formats">
          <ul className="grid gap-2">
            {BRACKETS.map((b) => {
              const v = s.decks.byBracket[String(b.id)] ?? 0;
              return <Bar key={b.id} label={b.label} value={v} max={bracketTotal} text={`${v} (${Math.round((v / bracketTotal) * 100)}%)`} />;
            })}
          </ul>
          <p className="mt-4 text-[15px] text-cream-dim">
            {Object.entries(s.decks.byFormat).sort((a, b) => b[1] - a[1]).map(([f, v]) => `${FORMATS.find((x) => x.id === f)?.label ?? f} ${v}`).join(" · ") || "No decks yet."}
          </p>
        </Panel>
        <RankPanel title="Most-owned cards" rows={s.collections.mostOwned.map((r) => ({ ...r, decks: undefined }))} unit="people" empty="No card is owned by 2+ people yet." note={`${n(s.collections.people)} collections · ${n(s.collections.totalCards)} cards in total · median ${n(Math.round(s.collections.medianUnique ?? 0))} different cards each`} />
        <RankPanel title="Most-wanted (wishlists)" rows={s.topWishlist} unit="people" empty="No card is on 2+ wishlists yet." />
      </div>

      <Panel title="Sign-in methods">
        <p className="text-[17px] text-cream-dim">
          {Object.entries(s.users.byProvider).sort((a, b) => b[1] - a[1]).map(([p, v]) => `${PROVIDER[p] ?? p}: ${v}`).join(" · ")}
          {" · "}{n(s.users.withUsername)} with a username · {n(s.decks.aiBuilt)} decks used the AI pass · {n(s.shares.last30)} links shared in the last 30 days
        </p>
      </Panel>
    </div>
  );
}

/** A ranked list drawn as thin horizontal bars; it's also the table view (name, count, people). */
function RankPanel({ title, rows, unit, empty, note }: { title: string; rows: Ranked[]; unit: "decks" | "people"; empty: string; note?: string }) {
  const value = (r: Ranked) => (unit === "decks" ? r.decks ?? 0 : r.people);
  const max = Math.max(1, ...rows.map(value));
  return (
    <Panel title={title}>
      {note && <p className="mb-3 text-[15px] text-muted">{note}</p>}
      {rows.length ? (
        <ol className="grid gap-2">
          {rows.map((r, i) => (
            <Bar key={r.name} label={`${i + 1}. ${r.name}`} value={value(r)} max={max} text={unit === "decks" ? `${r.decks} deck${r.decks === 1 ? "" : "s"} · ${r.people} people` : `${r.people} people${r.copies ? ` · ${r.copies} copies` : ""}`} />
          ))}
        </ol>
      ) : (
        <p className="text-[16px] text-muted">{empty}</p>
      )}
    </Panel>
  );
}

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <li className="group" title={`${label}: ${text}`}>
      <div className="flex items-baseline justify-between gap-3 text-[16px]">
        <span className="truncate text-cream">{label}</span>
        <span className="shrink-0 text-[14px] text-cream-dim">{text}</span>
      </div>
      <div className="mt-1 h-2 bg-navy-900">
        <div className="px-bar h-full group-hover:opacity-80" style={{ width: `${Math.max(value ? 2 : 0, (value / max) * 100)}%`, boxShadow: "none" }} />
      </div>
    </li>
  );
}

/** "Admin dashboard" link for the Account page; renders nothing unless you're an admin. */
export function AdminLink() {
  const { user } = useAccount();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const sb = supabase();
    if (!sb || !user) return;
    let alive = true;
    sb.rpc("is_admin").then(({ data }) => { if (alive) setAdmin(data === true); }, () => {});
    return () => { alive = false; };
  }, [user]);
  if (!admin || !user) return null;
  return <a href="/admin" className="px-btn px-btn-ghost px-btn-sm inline-block">Admin dashboard</a>;
}
