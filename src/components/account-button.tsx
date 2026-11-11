"use client";

import Link from "next/link";
import { useAccount } from "./sync-provider";

/** Header button: "Sign in", or the user's initial with a sync-status dot. Hidden when accounts aren't set up. */
export function AccountButton() {
  const { configured, ready, user, status, pending, needsLink } = useAccount();
  if (!configured || !ready) return null;
  if (!user) {
    return (
      <Link href="/account" className="px-btn px-btn-sm inline-block">
        Sign in
      </Link>
    );
  }
  const dot = status === "error" || needsLink ? "bg-red" : status === "syncing" ? "bg-orange" : pending > 0 ? "bg-gold" : "bg-green";
  const label = needsLink ? "Choose what to do with this device's data" : status === "error" ? "Sync error" : status === "syncing" ? "Syncing…" : pending > 0 ? `${pending} change(s) waiting to sync` : "All synced";
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <Link href="/account" className="relative inline-flex h-9 w-9 items-center justify-center bg-navy-600 font-pixel text-[15px] text-cream px-border" title={`${user.email ?? user.name ?? "Account"} · ${label}`} aria-label={`Account: ${label}`}>
      {user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt="" width={36} height={36} className="h-full w-full object-cover" style={{ imageRendering: "auto" }} referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
      <span className={`absolute -bottom-1 -right-1 h-3 w-3 ${dot}`} aria-hidden />
    </Link>
  );
}
