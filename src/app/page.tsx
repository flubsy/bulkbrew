import Link from "next/link";
import { HomeHero } from "@/components/home-hero";
import { ARROW, BINDER, DECK_BOX, ICON_ANVIL, ICON_CAULDRON, ICON_CHEST, ICON_DIE, Sprite, TOME } from "@/components/sprites";

const PATH = [
  { n: "1", title: "Bulk", sprite: BINDER, body: "Import the cards you own from a CSV, an Excel sheet or a pasted list. Each one is matched on Scryfall for its rules text, legality and price." },
  { n: "2", title: "Brew", sprite: ICON_CAULDRON, body: "Pick a commander, a theme, a bracket and a budget. Every card you own is scored against EDHREC and the decks people actually play." },
  { n: "3", title: "Deck", sprite: DECK_BOX, body: "Out comes a full 100: ramp, draw, removal and a mana base, with the reason each card made it and a bench of swaps you already own." },
];

const MORE = [
  { href: "/roll", icon: ICON_DIE, title: "Roll a commander", body: "Can't choose? Roll a commander from your collection and the way most people build it, then brew it in one click." },
  { href: "/upgrade", icon: ICON_ANVIL, title: "Upgrade a deck you play", body: "Bring a Moxfield or Archidekt list. BulkBrew finds the best swaps sitting in your bulk and explains each one." },
  { href: "/upgrade", icon: TOME, title: "Explain how a deck works", body: "A primer for any list: the game plan, key cards, combo lines, mulligans and its weak spots." },
  { href: "/account", icon: ICON_CHEST, title: "Take it everywhere", body: "Sign in and your collection and decks follow you to your phone and your friend's laptop." },
];

export default function Home() {
  return (
    <div>
      <HomeHero />

      {/* Bulk → Brew → Deck: the transformation, one numbered step at a time. */}
      <section aria-labelledby="how" className="py-14">
        <h2 id="how" className="font-pixel text-[22px] text-cream">From binder to battlefield</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start">
          {PATH.map((p, i) => (
            <li key={p.n} className="contents">
              <div>
                <div className="flex h-14 items-end gap-4">
                  <span className="font-wordmark text-[22px] text-orange" aria-hidden>{p.n}</span>
                  <Sprite grid={p.sprite} scale={4} />
                </div>
                <h3 className="font-pixel mt-4 text-[18px] text-cream">{p.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[18px] text-cream-dim">{p.body}</p>
              </div>
              {i < PATH.length - 1 && <Sprite grid={ARROW} scale={4} className="hidden self-center md:block" />}
            </li>
          ))}
        </ol>
      </section>

      {/* The promise, with what a reason actually looks like. */}
      <section aria-labelledby="own" className="-mx-4 border-y-4 border-navy-600 bg-navy-900 px-4 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 id="own" className="font-pixel text-[22px] text-cream">Only what&apos;s in your binder</h2>
            <p className="mt-4 max-w-[60ch] text-[19px] text-cream-dim">
              BulkBrew never slips in a card you&apos;d have to buy. Cards EDHREC suggests that you don&apos;t own go to a wishlist instead. Every pick and every swap comes with its reason, worked out from EDHREC play rates, Scryfall card roles and Commander Spellbook combos. No AI is required.
            </p>
            <Link href="/faq" className="mt-5 inline-block text-[17px] text-orange underline underline-offset-4">How scores and power levels are calculated</Link>
          </div>
          <figure className="px-border px-panel p-5">
            <figcaption className="px-label">Example swap reason</figcaption>
            <p className="mt-2 text-[18px]">
              <span className="text-muted line-through decoration-orange">Hill Giant</span>
              <span className="mx-2 text-orange" aria-hidden>→</span>
              <span className="text-cream">Scourge of Valkas</span>
            </p>
            <ul className="mt-3 grid gap-1 text-[17px] text-cream-dim">
              <li>+ Played in 81% of Lathliss decks on EDHREC, Dragons builds.</li>
              <li>+ A tribal lord: it&apos;s a Dragon and it rewards Dragons entering.</li>
              <li>− Hill Giant: no link to the commander or your theme.</li>
            </ul>
          </figure>
        </div>
      </section>

      {/* Everything else in the pot: a ledger, not a grid of tiles. */}
      <section aria-labelledby="more" className="py-14">
        <h2 id="more" className="font-pixel text-[22px] text-cream">More in the pot</h2>
        <ul className="mt-6 divide-y-4 divide-navy-600 border-y-4 border-navy-600">
          {MORE.map((m) => (
            <li key={m.title}>
              <Link href={m.href} className="group grid grid-cols-[auto_1fr_auto] items-center gap-5 py-5 hover:bg-navy-700">
                <Sprite grid={m.icon} scale={4} className="ml-2" />
                <span>
                  <span className="font-pixel block text-[17px] text-cream group-hover:text-orange">{m.title}</span>
                  <span className="mt-1 block max-w-[70ch] text-[17px] text-cream-dim">{m.body}</span>
                </span>
                <Sprite grid={ARROW} scale={3} className="mr-3 opacity-60 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="close" className="pb-16 text-center">
        <h2 id="close" className="font-wordmark text-[18px] leading-[1.7] text-cream sm:text-[22px]">
          Your next deck is <span className="text-orange">already in the box.</span>
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/collection" className="px-btn inline-block">Import your collection</Link>
          <Link href="/build" className="px-btn px-btn-ghost inline-block">Open the builder</Link>
        </div>
      </section>
    </div>
  );
}
