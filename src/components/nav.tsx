"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { CARD, Sprite } from "./sprites";

const LINKS = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/collection", label: "Collection", short: "Cards" },
  { href: "/build", label: "Build", short: "Build" },
  { href: "/upgrade", label: "Upgrade", short: "Upgrade" },
  { href: "/saved", label: "Saved", short: "Saved" },
  { href: "/decks", label: "Reference decks", short: "Refs" },
] as const;

export function Nav() {
  const path = usePathname();
  const owned = useLiveQuery(() => db.owned.count(), [], 0);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 border-b-4 border-navy-600 bg-navy-800/95 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Sprite grid={CARD} scale={2} />
            <span className="font-wordmark text-[12px] text-cream">
              Deck<span className="text-orange">bit</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {LINKS.slice(1).map((l) => (
              <Link key={l.href} href={l.href} className={`font-pixel text-[15px] ${active(l.href) ? "text-orange" : "text-cream-dim hover:text-cream"}`} aria-current={active(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
            <span className="font-body text-[16px] text-muted" title="Cards in your collection">
              {owned ?? 0} owned
            </span>
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-navy-600 bg-navy-900 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary mobile">
        <ul className="grid grid-cols-6">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={`flex h-16 flex-col items-center justify-center gap-2 font-pixel text-[11px] ${active(l.href) ? "text-orange" : "text-cream-dim"}`} aria-current={active(l.href) ? "page" : undefined}>
                <span className={`block h-2 w-8 ${active(l.href) ? "bg-orange" : "bg-navy-600"}`} aria-hidden />
                {l.short}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
