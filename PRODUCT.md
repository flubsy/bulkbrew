# Deckbit — product brief

## What it is
A web/mobile app that builds the most powerful deck possible from a Magic: The Gathering player's own collection. Users import what they own, optionally feed it real decklists from Moxfield/Archidekt/MTGGoldfish, then dial in format, commander, bracket, theme, budget and sets. A rules engine scores and fills the deck; Claude refines it with swaps validated against ownership.

## Who it's for
Commander-first players (also 60-card formats) who own a few hundred to tens of thousands of cards, track them in ManaBox/Moxfield/Archidekt/sheets, and want "what's the best deck I can build *right now* without buying anything".

## Core promise
Never suggest a card the user doesn't own. Basics are the only exception and it's a toggle.

## Jobs to be done
- "I've got a pile of cards and a commander in mind — give me a 99 that works."
- "Build me an Elf tribal / artifact / +1/+1 counters deck from my binder."
- "Keep it bracket 2 for my pod." / "Make it as strong as my cards allow."
- "Only use cards from these sets." / "Don't touch the cards in my other deck."
- "What would this cost to replace?"

## Constraints
- Browser-only storage (no accounts). Server is stateless.
- Scryfall is the single source of card truth. Respect their rate limits and attribution.
- Deck sites block scrapers inconsistently; paste-text must always be a first-class fallback.
- Mobile: usable one-handed, bottom tab bar, no horizontal scroll except tables.

## Tone
Arcade-cabinet confidence. Short, direct copy. No marketing fluff. Numbers where they help, not everywhere.
