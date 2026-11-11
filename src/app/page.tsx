import Link from "next/link";
import { BOAT, CASTLE, DRAGON, LEVIATHAN, MOON, Sprite, SWORD, TOME, WIZARD } from "@/components/sprites";
import { HomeStats } from "@/components/home-stats";

export default function Home() {
  return (
    <div>
      {/* Hero: a castle on the cliff, a dragon crossing the moon, a leviathan in the bay. */}
      <section className="relative -mx-4 overflow-hidden border-b-4 border-navy-600 bg-navy-900 px-4 pt-8 md:pt-12">
        <div className="starfield left-0 top-0" aria-hidden />
        <div className="absolute right-[8%] top-10 md:right-[14%] md:top-12" aria-hidden>
          <Sprite grid={MOON} scale={4} className="md:hidden" />
          <Sprite grid={MOON} scale={7} className="hidden md:block" />
        </div>
        <div className="fly absolute left-0 top-16 md:top-20" aria-hidden>
          <Sprite grid={DRAGON} scale={3} className="md:hidden" />
          <Sprite grid={DRAGON} scale={5} className="hidden md:block" />
        </div>

        <div className="relative mx-auto max-w-3xl py-10 text-center md:py-16">
          <p className="font-pixel text-[14px] text-cream-dim">your cards · your deck</p>
          <h1 className="font-wordmark mt-6 text-[20px] leading-[1.6] text-cream md:text-[32px]">
            Every card you own.
            <br />
            <span className="text-orange">The best deck it can be.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[21px] text-cream-dim">
            Import your collection, pick a commander, a theme, a bracket and a budget. Deckbit scores every card you own against EDHREC and the decks people actually play, builds the strongest list, and lets Claude tighten it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/collection" className="px-btn inline-block">
              Import collection
            </Link>
            <Link href="/build" className="px-btn px-btn-ghost inline-block">
              Open the builder
            </Link>
          </div>
          <p className="mt-6 font-pixel text-[13px] text-muted">
            press start <span className="blink">▮</span>
          </p>
        </div>

        {/* Skyline: castle left, wizard on the battlements */}
        <div className="relative h-0" aria-hidden>
          <div className="absolute bottom-0 left-0 hidden md:block">
            <Sprite grid={CASTLE} scale={6} />
          </div>
          <div className="absolute bottom-0 left-0 md:hidden">
            <Sprite grid={CASTLE} scale={3} />
          </div>
          <div className="absolute bottom-[120px] left-[72px] hidden md:block">
            <Sprite grid={WIZARD} scale={4} />
          </div>
        </div>

        {/* Sea */}
        <div className="relative mt-0 h-36 md:h-48" aria-hidden>
          <div className="absolute inset-0 bg-sea" />
          <div className="absolute right-[12%] top-0 h-full w-16 moon-path md:right-[18%] md:w-24" />
          <div className="absolute inset-x-0 top-3 flex flex-col gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="sea-row" style={{ marginLeft: `${(i * 37) % 60}px` }} />
            ))}
          </div>
          <div className="bob absolute bottom-8 right-[6%] md:right-[10%]">
            <Sprite grid={LEVIATHAN} scale={3} className="md:hidden" />
            <Sprite grid={LEVIATHAN} scale={5} className="hidden md:block" />
          </div>
          <div className="bob absolute bottom-12 left-1/2 -translate-x-1/2 md:left-[45%]" style={{ animationDelay: "1.2s" }}>
            <Sprite grid={BOAT} scale={4} />
          </div>
        </div>
      </section>

      <HomeStats />

      <section className="mt-12 grid gap-6 md:grid-cols-3">
        <Feature sprite={TOME} title="1 · Import the grimoire" body="Drop in a ManaBox, Moxfield, Archidekt or Deckbox CSV, an Excel sheet, or paste a list. Every row is matched to Scryfall for types, text, legality and price." />
        <Feature sprite={SWORD} title="2 · Study the masters" body="Paste Moxfield, Archidekt or MTGGoldfish deck links and let EDHREC weigh in. Cards that real decks run get a boost when they're in your collection." />
        <Feature sprite={DRAGON} title="3 · Forge the deck" body="Choose format, commander, theme or tribe, bracket, budget and sets. The engine fills ramp, draw, removal and the mana base from what you own; Claude refines the swaps and rates the power." />
      </section>

      <section className="mt-12 px-border px-panel p-6 md:p-8">
        <h2 className="font-pixel text-[16px] text-orange">Why it never suggests cards you don&apos;t own</h2>
        <p className="mt-4 max-w-3xl text-[20px] text-cream-dim">
          The builder only ever draws from your imported pool. The AI pass works from a bench of your own eligible cards and every proposed swap is validated against ownership, quantity, colour identity, legality and bracket before it lands. EDHREC picks you don&apos;t own go to a wishlist instead. Basics are the one exception, and you can turn that off.
        </p>
      </section>
    </div>
  );
}

function Feature({ sprite, title, body }: { sprite: string[]; title: string; body: string }) {
  return (
    <article className="px-border px-panel p-5">
      <div className="flex h-16 items-end">
        <Sprite grid={sprite} scale={3} />
      </div>
      <h3 className="font-pixel mt-4 text-[15px] text-cream">{title}</h3>
      <p className="mt-3 text-[19px] text-cream-dim">{body}</p>
    </article>
  );
}
