import type { Metadata } from "next";
import Link from "next/link";
import { ICON_CAULDRON, Sprite } from "@/components/sprites";

export const metadata: Metadata = {
  title: "How it works",
  description: "How BulkBrew scores cards, builds and upgrades decks, rates power level and uses EDHREC, Scryfall and Commander Spellbook data.",
};

const TOC = [
  ["data", "Where the data comes from"],
  ["scoring", "How a card earns its place"],
  ["building", "How a deck is built"],
  ["power", "Power level"],
  ["brackets", "Brackets vs power"],
  ["upgrades", "Upgrades and swap reasons"],
  ["primers", "Primers and combos"],
  ["privacy", "Your data, accounts and AI"],
] as const;

const SCORE_ROWS = [
  ["EDHREC play rate for this commander", "Up to about +12", "How often decks with this commander, or this commander's tag, run the card, and how much more than other decks in these colours (synergy)."],
  ["In EDHREC's average deck", "+4", "The typical 100-card list for the commander, which is the strongest 'people actually play this here' signal."],
  ["Archetype-wide EDHREC data", "Up to +5", "How the card does in every deck with this tag and colours, whatever the commander. It catches strong cards one commander's page under-rates."],
  ["Newer than the commander", "Play rate ×1–2", "EDHREC counts decks built before a card existed, so recent cards get their play rate scaled up to match."],
  ["Theme and tribe", "+4 to +10", "Rules text that fits your chosen theme, or your creature type (lords score highest)."],
  ["Commander hooks", "+2.5 each", "Things your commander's own text cares about, such as tokens, the graveyard or spells."],
  ["Overall popularity", "0 to +10", "The card's EDHREC rank across all Commander decks (a log scale)."],
  ["Role", "+0.5 to +2", "Ramp, draw and removal get a nudge so interaction isn't crowded out. Cheap ones get a little more."],
  ["Bracket rules", "Down to −100", "Game changers, extra turns, mass land denial and fast mana are limited by your bracket."],
] as const;

const POWER_ROWS = [
  ["Baseline", "4", "Any functional Commander deck starts here."],
  ["Missing fundamentals", "−0.5 each", "Fewer than 32 or more than 42 lands, under 7 ramp, under 6 draw, or under 6 answers."],
  ["Mana curve", "−0.5 to +1.5", "Average mana value of non-lands: ≤2.2 gives +1.5, ≤2.6 gives +1, ≤3.0 gives +0.5, ≥3.8 gives −0.5."],
  ["Fast mana", "+0.5 / +1", "Ramp costing 1 or less: 2+ pieces or 4+ pieces."],
  ["Tutors", "+0.5 / +1 / +1.5", "2+, 4+ or 6+ tutors."],
  ["Cheap interaction", "+0.5 / +1", "Removal, counters and protection at 2 mana or less: 6+ or 10+."],
  ["Game changers", "+0.25 each, max +1", "From the official Commander game-changer list."],
  ["Combos", "+1 / +1.5", "One or more, or three or more, real combos found by Commander Spellbook."],
  ["Synergy", "+0.5", "When 70%+ of non-land cards are ones EDHREC lists for the commander."],
] as const;

export default function FaqPage() {
  return (
    <div className="py-8">
      <div className="flex items-end gap-4">
        <h1 className="font-pixel text-[26px] text-cream">How BulkBrew works</h1>
        <Sprite grid={ICON_CAULDRON} scale={4} className="mb-1" />
      </div>
      <p className="mt-3 max-w-[68ch] text-[19px] text-cream-dim">
        Everything BulkBrew decides comes from public data and fixed rules, not guesswork and not AI. Here&apos;s exactly how, so you can argue with it.
      </p>

      <nav aria-label="On this page" className="mt-8 border-y-4 border-navy-600 py-4">
        <ol className="grid gap-x-8 gap-y-2 text-[17px] sm:grid-cols-2">
          {TOC.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="text-cream-dim underline decoration-navy-500 underline-offset-4 hover:text-orange hover:decoration-orange">{label}</a></li>
          ))}
        </ol>
      </nav>

      <article className="max-w-[72ch] text-[18px] leading-[1.55] text-cream-dim">
        <Section id="data" title="Where the data comes from">
          <ul className="grid list-disc gap-2 pl-6">
            <li><b className="text-cream">Your collection:</b> what you import. It&apos;s the only pool decks are built from.</li>
            <li><b className="text-cream">Scryfall:</b> every card&apos;s rules text, type, colour identity, legality, price and game-changer status.</li>
            <li><b className="text-cream">Scryfall Tagger:</b> community-curated tags for what a card <i>does</i> (ramp, removal, draw, wipe, tutor, counterspell, protection, recursion). This is far more accurate than guessing from rules text.</li>
            <li><b className="text-cream">EDHREC:</b> what real decks play. It covers each commander&apos;s card list, play rates, synergy, the average deck, deck tags like &ldquo;Dragons&rdquo; or &ldquo;Treasure&rdquo;, and commander popularity.</li>
            <li><b className="text-cream">Commander Spellbook:</b> combos, with step-by-step instructions.</li>
          </ul>
          <p className="mt-3">EDHREC and Spellbook results are cached for a day, so building twice is fast and kind to those free services.</p>
        </Section>

        <Section id="scoring" title="How a card earns its place">
          <p>Every card you own that&apos;s legal, in colour and inside your filters gets a score. The score is the sum of these signals:</p>
          <Table head={["Signal", "Points", "What it means"]} rows={SCORE_ROWS} />
          <p className="mt-3">Each signal is kept alongside the score, which is how every pick and swap can explain itself in plain English.</p>
        </Section>

        <Section id="building" title="How a deck is built">
          <ol className="grid list-decimal gap-2 pl-6">
            <li><b className="text-cream">Template first:</b> if you own a good share of EDHREC&apos;s average deck for your commander (and tag), those cards go in first.</li>
            <li><b className="text-cream">Must-includes,</b> then <b className="text-cream">role targets</b>, e.g. about 10 ramp, 10 draw, 8 removal and 2 wipes. Targets shift with your theme.</li>
            <li><b className="text-cream">The best of the rest</b> by score. The curve follows EDHREC&apos;s average curve for the commander, so a top-heavy Dragons deck is allowed to be top-heavy.</li>
            <li><b className="text-cream">Mana base:</b> lands are scored on the colours you actually use. Basics are split by your colour pips.</li>
            <li><b className="text-cream">Checks:</b> a power rating, a combo scan, a bench of alternatives you own, and a wishlist of EDHREC picks you don&apos;t.</li>
          </ol>
        </Section>

        <Section id="power" title="Power level">
          <p>
            Power is a 1–10 rating of how <b className="text-cream">fast and consistently</b> a deck wins, on the scale Commander players already use: precons around 4–5, tuned casual decks 6–7, high power 8, cEDH 9–10. It starts from a baseline and adds points only for things that genuinely make decks faster:
          </p>
          <Table head={["Factor", "Points", "Rule"]} rows={POWER_ROWS} />
          <p className="mt-4">Then ceilings stop a well-built casual deck from reaching cEDH numbers. When one applies, the deck page tells you which:</p>
          <ul className="mt-2 grid list-disc gap-2 pl-6">
            <li><b className="text-cream">Max 7</b> with no combos and at most one tutor.</li>
            <li><b className="text-cream">Max 8</b> without 2+ fast mana and either 3+ tutors or a combo.</li>
            <li><b className="text-cream">Max 8 again</b> until it has 4+ fast mana, 5+ tutors and a combo (that&apos;s a 9, fringe cEDH).</li>
            <li><b className="text-cream">Max 9</b> until it has 6+ fast mana, 7+ tutors, 2+ combos and an average mana value of 2.2 or less (that&apos;s a 10, cEDH).</li>
          </ul>
          <h3 className="font-pixel mt-6 text-[16px] text-cream">Compared with EDHPowerLevel.com</h3>
          <p className="mt-2">
            Same scale, different method. EDHPowerLevel rates the strength of the individual cards in a list. BulkBrew rates the deck&apos;s speed and consistency: curve, fast mana, tutors, cheap interaction, combos. So the two can disagree by a point. A deck of strong cards with no plan scores higher there; a lean, focused deck can score higher here. Both are conversation starters for your pod, not verdicts.
          </p>
          <p className="mt-3 text-[16px] text-muted">
            Earlier versions of BulkBrew rated generously, so a solid bracket 3 deck could show 9 or 10. Saved decks now show the corrected number.
          </p>
        </Section>

        <Section id="brackets" title="Brackets vs power">
          <p>
            <b className="text-cream">Brackets</b> (1–5) are the official Commander rules for which cards are fair game: game changers, mass land denial, extra turns, early two-card combos. <b className="text-cream">Power</b> is how strong the deck plays. They usually move together, but a bracket 3 deck can be a 6 or an 8 depending on how tight it is. BulkBrew uses your bracket to decide what&apos;s <i>allowed</i>, and power to describe what you <i>got</i>.
          </p>
        </Section>

        <Section id="upgrades" title="Upgrades and swap reasons">
          <p>
            The upgrader scores your current list and your collection with the same rules. It cuts illegal or off-colour cards first. Then it repeatedly makes the single biggest improvement, while keeping your ramp, draw, removal and land counts balanced, until nothing beats your current card by the margin you chose. Every reason you see (&ldquo;Played in 81% of Lathliss decks&rdquo;, &ldquo;Your list had 6 removal; a typical target is 8&rdquo;) is written from those numbers.
          </p>
        </Section>

        <Section id="primers" title="Primers and combos">
          <p>
            &ldquo;How this deck works&rdquo; is assembled from the commander&apos;s own rules text, the deck&apos;s theme or EDHREC tag, each card&apos;s role and curve slot, and Commander Spellbook&apos;s combo steps. It&apos;s a solid starting primer; it won&apos;t know the clever lines only you have spotted.
          </p>
        </Section>

        <Section id="privacy" title="Your data, accounts and AI">
          <ul className="grid list-disc gap-2 pl-6">
            <li><b className="text-cream">On your device:</b> your collection and decks live in your browser. Download a backup from the Collection page any time.</li>
            <li><b className="text-cream">Accounts (optional):</b> sign in to sync across devices. Only you can read your data; the database enforces it.</li>
            <li><b className="text-cream">AI (optional, off by default):</b> a Claude pass can suggest swaps from your own cards. Nothing on this page needs it.</li>
          </ul>
        </Section>
      </article>

      <p className="mt-10 text-[17px]">
        <Link href="/build" className="px-btn inline-block">Brew a deck</Link>
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 scroll-mt-24">
      <h2 id={`${id}-h`} className="font-pixel mb-3 text-[20px] text-orange">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="px-table w-full min-w-[560px] text-[16px]">
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <th scope="row" className="!text-[15px] !normal-case !tracking-normal text-cream">{r[0]}</th>
              <td className="whitespace-nowrap text-orange">{r[1]}</td>
              <td>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
