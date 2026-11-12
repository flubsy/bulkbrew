"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { AccountButton } from "./account-button";
import { CurrencyPicker } from "./currency-provider";
import { ICON_ANVIL, ICON_CARDS, ICON_CAULDRON, ICON_CHEST, ICON_DIE, ICON_HOME, ICON_SWORD, Sprite } from "./sprites";

type Tab = { href: string; label: string; short: string; icon: string[]; match?: string[] };

const TABS: Tab[] = [
  { href: "/", label: "Home", short: "Home", icon: ICON_HOME },
  { href: "/collection", label: "Collection", short: "Cards", icon: ICON_CARDS },
  { href: "/build", label: "Build", short: "Build", icon: ICON_SWORD },
  { href: "/roll", label: "Roll", short: "Roll", icon: ICON_DIE },
  { href: "/upgrade", label: "Upgrade", short: "Upgrade", icon: ICON_ANVIL },
  { href: "/saved", label: "Saved", short: "Saved", icon: ICON_CHEST, match: ["/saved", "/decks"] },
];

export const SAVED_LINKS = [
  { href: "/saved", label: "Saved decks", blurb: "Everything you've built or upgraded" },
  { href: "/decks", label: "Reference decks", blurb: "Lists you scraped to teach the builder" },
  { href: "/saved/wishlist", label: "Wishlist", blurb: "Cards you're hunting for" },
] as const;

function isActive(path: string, t: Tab) {
  if (t.href === "/") return path === "/";
  return (t.match ?? [t.href]).some((m) => path === m || path.startsWith(m + "/"));
}

/** "Aa" toggle between the pixel font and Atkinson Hyperlegible. Stored per device. */
function FontToggle() {
  const [readable, setReadable] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReadable(document.documentElement.dataset.font === "readable"), 0);
    return () => clearTimeout(t);
  }, []);
  function toggle() {
    const next = !readable;
    setReadable(next);
    if (next) document.documentElement.dataset.font = "readable";
    else delete document.documentElement.dataset.font;
    try { localStorage.setItem("deckbit.font", next ? "readable" : ""); } catch { /* ignore */ }
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={readable} className="px-chip px-border !px-2 !py-1" title={readable ? "Switch back to the pixel font" : "Switch to an easier-to-read font"}>
      <span className="text-[14px]">Aa</span>
    </button>
  );
}

function SavedMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Close when the route changes (back/forward while it's open).
  const path = usePathname();
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`flex items-center gap-2 font-pixel text-[15px] ${active ? "text-orange" : "text-cream-dim hover:text-cream"}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <Sprite grid={ICON_CHEST} scale={2} /> Saved <span className="text-[10px]">▼</span>
      </button>
      {open && (
        <div role="menu" className="px-border px-border-strong absolute right-0 top-full z-50 mt-3 w-64 bg-navy-900 p-2">
          {SAVED_LINKS.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-navy-600">
              <span className="font-pixel block text-[14px] text-cream">{l.label}</span>
              <span className="block text-[14px] text-muted">{l.blurb}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const owned = useLiveQuery(() => db.owned.count(), [], 0);

  return (
    <>
      <header className="sticky top-0 z-40 border-b-4 border-navy-600 bg-navy-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Sprite grid={ICON_CAULDRON} scale={3} />
            <span className="font-wordmark text-[12px] text-cream">
              Bulk<span className="text-orange">Brew</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
            {TABS.slice(1, -1).map((t) => (
              <Link key={t.href} href={t.href} className={`flex items-center gap-2 font-pixel text-[15px] ${isActive(path, t) ? "text-orange" : "text-cream-dim hover:text-cream"}`} aria-current={isActive(path, t) ? "page" : undefined}>
                <Sprite grid={t.icon} scale={2} /> {t.label}
              </Link>
            ))}
            <SavedMenu active={isActive(path, TABS[TABS.length - 1])} />
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-[15px] text-muted md:inline" title="Cards in your collection">{owned ?? 0} owned</span>
            <CurrencyPicker />
            <FontToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-navy-600 bg-navy-900 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary mobile">
        <ul className="grid grid-cols-6">
          {TABS.map((t) => {
            const on = isActive(path, t);
            return (
              <li key={t.href}>
                <Link href={t.href} className={`flex h-16 flex-col items-center justify-center gap-1 font-pixel text-[11px] ${on ? "text-orange" : "text-cream-dim"}`} aria-current={on ? "page" : undefined}>
                  <Sprite grid={t.icon} scale={2} className={on ? "" : "opacity-70"} />
                  {t.short}
                  <span className={`block h-1 w-6 ${on ? "bg-orange" : "bg-transparent"}`} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Tab strip shown at the top of the three "Saved" pages (so mobile users can switch). */
export function SavedTabs() {
  const path = usePathname();
  return (
    <div className="mt-4 flex flex-wrap gap-1">
      {SAVED_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="px-chip px-border" aria-pressed={path === l.href}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
