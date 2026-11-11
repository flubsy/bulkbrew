# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A mobile web app installable as a PWA. An Android Play Store release is planned as a Trusted Web Activity wrapping the same site, so the design language stays web. iOS may follow later.)

## Users

Commander-first Magic: The Gathering players, with 60-card formats secondary. They own anywhere from a few hundred to tens of thousands of cards and track them in ManaBox, Moxfield, Archidekt or spreadsheets. Their job: "what's the best deck I can build *right now* from cards I already own, without buying anything?"

Audience stage: **the owner and his playgroup now, the public later.** Friends are the first real testers. A public release, including the Play Store, comes once the product is solid. Decisions should work for a small trusted group today without blocking strangers tomorrow.

## Product Purpose

Turn a player's collection ("bulk") into the strongest deck it can make, then keep improving decks from the same bulk. Success means a player gets a deck they'd actually sleeve up, built only from cards they own, and understands why each card is there.

## Positioning

Every recommendation is limited to cards the user owns, and every pick and swap explains itself in plain language. Deck sites suggest cards you'd have to buy; BulkBrew works backwards from what's in the binder. The engine is rules-based, built on EDHREC, Scryfall and Commander Spellbook data, so it's free to run for anyone and doesn't depend on AI.

## Operating Context

- **Collection import:** CSV or Excel exports from ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield and TCGplayer, or pasted lists.
- **Decks in:** links from Moxfield, Archidekt, MTGGoldfish, Deckstats or TappedOut, or pasted lists. Moxfield often blocks automated requests, so pasting is always a first-class route.
- **Core flows:**
  - Build a deck from your collection: commander, theme or EDHREC tag, bracket, budget, sets.
  - Roll a random commander and build.
  - Upgrade an existing deck from your bulk, with a swap summary.
  - Explain a deck with a primer.
  - Save decks and a wishlist.
  - Export lists to Moxfield or Archidekt.
- **Where it's used:** on phones at the table or on the couch, and on desktop when importing and tuning. One-handed mobile use matters.
- **Shared vocabulary:** Commander brackets 1–5, game changers, EDHREC tags, the average deck, color identity, and guild/shard/wedge names (Mardu, Jeskai…).

## Capabilities and Constraints

- **Local-first data:** stored in the browser (IndexedDB) and works offline. Optional accounts sync collection, decks, reference decks and wishlist across devices: Supabase, with Google, Discord and email-link sign-in; Apple sign-in is planned alongside iOS. Friends' existing local data must survive every update, so schema changes stay additive.
- **Card data:** Scryfall is the single source of truth; respect its rate limits and attribution. EDHREC and Commander Spellbook are best-effort and cached; the app must degrade gracefully without them.
- **AI:** optional and off by default. A Claude pass can propose swaps from the user's own cards, but nothing requires it.
- **Mobile:** bottom tab bar, no horizontal page scroll except data tables.
- **Name rollout:** the app is renamed to BulkBrew on screen. Internal storage keys keep `deckbit` so existing data survives. The GitHub repo, Vercel project and domain are still named deckbit until the owner renames them.

## Brand Commitments

- **Name: BulkBrew** (chosen 2026-11-11, replacing the working name Deckbit). "Brew" is what players call deckbuilding; "bulk" is the cards they already own.
- **Identity:** pixel / 8-bit fantasy-Magic look, with castles, dragons, leviathans and wizards; RuneScape-esque rather than generic retro. Dark navy and charcoal with orange highlights. The owner likes motion such as bobbing sprites and a flying dragon, but not boats.
- **Voice:** arcade-cabinet confidence. Short, direct copy, no marketing fluff, numbers where they help.

## Evidence on Hand

- Real data sources: Scryfall, Scryfall Tagger role tags (`src/data/roles.json`), EDHREC commander/tag/average-deck data, Commander Spellbook combos.
- The owner's own collection of about 2,100 cards was used in testing. A friend is currently testing.
- No testimonials, user counts, reviews or press exist. Never invent them.

## Product Principles

1. **Only what you own.** Never recommend a card outside the user's collection unless it's clearly labelled as a wishlist suggestion.
2. **Show the why.** Every pick, swap and score carries a plain-language reason built from real numbers.
3. **Free to run, AI optional.** Core features must work with no AI, no paid APIs and no account.
4. **Never lose a player's cards.** Data changes are additive and backed up, and sync never silently deletes.
5. **Paste always works.** Every import path has a manual paste fallback.

## Accessibility & Inclusion

- **Readability is a requirement, not a preference.** The owner finds pixel fonts hard to read. Headings, art and chrome stay pixel. Body text must be comfortably readable by default. An "Aa" toggle switches all text to Atkinson Hyperlegible.
- Meet WCAG 2.2 AA contrast for text. Make everything usable by keyboard and screen reader (see `.claude/skills/frontend-ally`). Respect reduced-motion settings.
- Card images always have text alternatives: names and types are shown alongside them.
