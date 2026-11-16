# How Deckbit builds and upgrades decks

**Short version:** the engine is rules-based. Every build and upgrade runs on free public data (your collection, Scryfall, EDHREC, Commander Spellbook) plus the scoring and filling logic in `src/lib/builder/`. Claude is an optional extra pass that is **off by default**, and so far it has never run on this install (no API key is set). Friends can use the app without it costing anything.

## Data sources

| Source | What we use it for | Cost / limits | Code |
|---|---|---|---|
| Your collection | The only cards a build may use | – | `db.ts` (browser IndexedDB) |
| **Scryfall** card data | Types, rules text, colour identity, legality, price, Scryfall's EDHREC rank, game-changer flag | Free, ~10 req/s | `scryfall.ts` |
| **Scryfall Tagger** oracle tags | Card *roles* (ramp, removal, draw, wipe, tutor, counter, protection, recursion). Hand-curated by the community, far better than regexes | Free; downloaded once into `src/data/roles.json` with `npm run roles` | `builder/roles.ts` |
| **EDHREC** commander pages | Per-commander card list with inclusion % and synergy; the deck *tags* players use ("Dragons", "Treasure"); deck counts | Free JSON at json.edhrec.com; cached on disk 24h | `edhrec.ts` |
| **EDHREC** average decks | The typical 100-card list for a commander (optionally for one tag) | Same | `edhrec.ts` |
| **EDHREC** colour lists | Accurate "most played" and "rising" commander rankings | Same | `edhrec.ts` |
| **Commander Spellbook** | Combos in a list, and combos you could finish from your collection | Free POST API; cached 24h | `spellbook.ts` |
| Reference decks you add | Extra "people play this" signal for an archetype | – | `scrapers.ts` |

## Build pipeline (`builder/heuristic.ts`)

1. **Pool.** Collapse your printings into one entry per card name (cheapest owned price).
2. **Filter.** Drop cards that aren't legal, are off-colour, sit outside chosen sets, are over the per-card price cap, or are on the never-use list.
3. **Score** every remaining card. Each part of the score is also recorded as a *fact*, so we can explain it later:
   - Overall popularity (Scryfall's EDHREC rank, log-scaled, 0–10).
   - Theme fit: rules-text patterns per theme, and tribal lord, member or payoff.
   - Commander hooks: what the commander's own text cares about.
   - EDHREC for this commander/tag: `synergy × 6 + inclusion × 6 + 1.5`, weighted by list section. "High synergy" and "top cards" get ×1.25 +1.5, "high lift" ×1.1 +0.5, "new cards" ×0.6. A card in several lists keeps its strongest section. For cards newer than the commander, inclusion is scaled up for the time they've been out (up to ×2, or ×4 in a card's first year).
   - **New and rising cards** (`trendFlag`): **hot** means printed in the last 18 months, with 30+ decks behind it, and already strong here (synergy ≥ 15%, time-adjusted inclusion ≥ 15%, or EDHREC trend score ≥ 2). It scores +2.5 and loses the "new cards" discount. **Trending** means an EDHREC trend score of 1 or more, and scores +1.5. **New** means a recent printing in EDHREC's "New cards" list; it's only a label. The deck list tags these HOT / TREND / NEW.
   - In EDHREC's average deck: +4.
   - Reference-deck frequency.
   - Role bonus and efficiency: cheap ramp and interaction score higher.
   - Bracket policy: game changers, extra turns, mass land denial and fast mana are penalised or capped by bracket.
4. **Fill.**
   - Must-includes go in first.
   - **Average-deck template.** If you own at least 40% of the non-basic cards in EDHREC's average deck, every owned non-land card from it goes in next, as long as it passes the bracket and budget rules. A note on the deck says so.
   - **Mana creatures.** Green commander decks take their best cheap mana creatures first: 4 at bracket 3+, 3 below. They count towards the ramp quota. Ramp is one quota, and otherwise popular rocks crowd dorks out.
   - Then role quotas, e.g. Commander: 10 ramp, 10 draw, 8 removal, 2 wipes; these shift by theme. The land count comes from EDHREC's average deck for the commander and tag (`panels.piechart` / type counts), clamped to 30–42; it falls back to 36 plus theme tweaks.
   - Then the best remaining cards, under curve caps and soft role ceilings. With EDHREC's `panels.mana_curve`, each mana value from 3 up gets roughly its share of the average deck. Mana values 0–2 are uncapped, and any slot the caps leave empty goes to the next-best spell, not an extra land. Without EDHREC, fixed caps apply, and they relax for top-heavy themes like Dragons.
   - **Dead-weight check** (`builder/needs.ts`). Some cards only work when the deck feeds them. Each one is checked against the finished list; a commander that supplies or rewards the thing counts as 4 cards. If the list can't support a card, it's cut and replaced, preferring the same role, and a note says why. Must-includes are never cut.

     | Card type | Needs (excluding itself) |
     |---|---|
     | Skullclamp-style | 8+ creatures with 1 toughness, or token makers |
     | Free sac outlets and death-trigger payoffs | 12+ token makers or creatures costing 2 or less |
     | Instant/sorcery payoffs | 15+ instants and sorceries |
     | Noncreature-spell payoffs | 20+ noncreature spells |
     | Life-gain triggers | 8+ ways to gain life |
     | Token payoffs | 8+ token makers |
     | +1/+1 counter payoffs | 8+ cards that place counters |
     | Artifact payoffs | 15+ artifacts or artifact-token makers |
     | Enchantment payoffs | 12+ enchantments |
   - **Finishers** (`finisherKind` in `classify.ts`) are grouped by how they win: overrun, drain, burn, alternate win, poison, extra combat, mill, draw-trigger damage, big threat.
     - A finisher whose kind matches your themes scores +2.5. One with no link to the deck (no theme, commander hook, tribe or EDHREC data) scores −3.
     - The finisher slots prefer different kinds: each pick counts 2.5 less for a second card of the same kind.
     - Draw-trigger finishers like Psychosis Crawler are also a dead-weight need: they're only kept with 12+ draw engines.
   - **Synergy pass** (`synergyWith` in `needs.ts`). Once the list exists, up to 8 swaps bring in bench cards that link up with what's actually in it: token makers beside token payoffs, fodder beside sacrifice outlets, spells beside spell payoffs, and so on.
     - Scoring: half a point per payoff a card supplies, and half a point per supplier a payoff gets, capped at 5.
     - A swap needs a net gain of 1.5 or more.
     - Ramp, draw, removal, wipes, counterspells, tutors, protection, recursion and finishers only swap like for like. Creatures, utility and synergy cards are flexible slots and can swap with each other.
     - Must-includes, combo pieces and lands never move.
   - **Combo pass** (`api/build`, after the first build). Commander Spellbook is given the list plus your 300 best eligible bench cards.
     - Up to 2 combos one or two owned cards away are completed (1 at bracket 3), then the deck is rebuilt around them.
     - Bracket 3 allows 3+ card combos, and 2-card ones whose pieces cost 6+ mana and aren't rated "Ruthless". Brackets 1–2 get none.
     - A note lists what was added and what was cut to make room.
5. **Mana base.** Nonbasic lands are scored for the colours you actually use. Basics are split by colour-pip share.
6. **Check.**
   - Power rating (`builder/power.ts`): curve, ramp and fast mana, tutors, interaction, draw, game changers, staple density, finishers and synergy.
   - Commander Spellbook combo scan, with a bracket warning.
   - Alternatives you own, and an EDHREC wishlist of cards you don't.

## Scryfall Tagger tags (`src/data/roles.json`, `src/data/tags.json`)

`npm run roles` (`scripts/build-roles.mjs`) downloads Scryfall Tagger's hand-curated function tags. Re-run it every month or two and commit the two JSON files.
- **Roles:** ramp, removal, wipe, draw, tutor, counter, protection, recursion.
- **Extra tags:** mana dork, mana rock, sacrifice outlet, death trigger, alternate win, win condition, token maker, treasure maker, anthem, mass pump, drain, burn, lifegain, extra combat, mill, self-mill, reanimate, flicker, cost reducer, ritual, copy spell, spells-matter, untapper, evasion, haste, +1/+1 counters, card advantage.

For tags whose slug isn't confirmed, the script tries a few likely slugs in order and logs any it can't find.

The tags are used in these places, always on top of the rules-text patterns (which remain the fallback):
- **Roles:** win-condition tags become finishers, and dork or rock tags become ramp.
- **Finisher kind:** an alternate win, mass pump or extra combat is read from tags first.
- **Mana creatures:** the mana-dork tag.
- **Theme fit:** a tagged card counts as on-theme. For example, sac outlets count for aristocrats, and rituals or cost reducers count for storm.
- **Supply/payoff checks and the synergy pass:** sac outlets, token makers, lifegain, spells-matter, treasure makers and counter placers.

## Bracket estimate

When Commander Spellbook answers, the deck's bracket comes from its `/estimate-bracket` endpoint. That classifies every card (game changer, mass land denial, extra turn, banned) and every combo (two-card, lock, skip turns). We map that onto the 1–5 scale:
- **Bracket 4:** more than 3 game changers, mass land denial, a lock-style combo, or the "Ruthless" tag.
- **Bracket 3:** 1–3 game changers, or a two-card combo.
- **Bracket 2:** otherwise.

The deck shows the reasons. When Spellbook is unreachable, the estimate falls back to counting game changers.

## Decks like yours (`builder/similar.ts`, `lib/similar-decks.ts`)

EDHREC's numbers say how often *the commander's* decks run a card. This step asks a second question: how often do the real decks that **look most like this list** run it?

- **Samples:** up to 40 real decklists for the commander, cached for a week. They come from EDHREC's recent decks for the commander first, then Archidekt's public deck search. Basics, the commander and maybeboard cards are removed. Fetching runs 6 at a time and gives up after 20 seconds; any failure just means fewer samples.
- **Weighting:** each sample is weighted by how much of our non-land list it also runs, squared, so close matches count far more than loose ones.
- **Fit:** fit = weighted share × 4 + (weighted − plain share) × 8, capped at 6. A card every deck runs gets little extra; a card the closest decks run much more than average gets a lot.
- **Builder:** after the synergy pass, up to 8 swaps where a bench card's score plus fit beats the weakest card in its slot by 2 or more. The swap rules are the same as the synergy pass, and the weights are recomputed after each swap. The note lists the swaps and how many samples came from each source.
- **Upgrade:** fit is added to both sides of every swap, and swaps it backs say "In N% of the real decks most like yours".
- **Fewer than 8 samples:** the step is skipped and a note says so.
- **Unverified endpoints:** the EDHREC deck-list and deck-preview paths and the Archidekt search parameters couldn't be checked from the build sandbox. If a source never returns decks, check the URLs in `lib/similar-decks.ts`.

## Primer: how it wins (`builder/primer.ts`)

Each way the deck can win gets its own entry, built from card text, the decklist and Commander Spellbook. It says how the route ends the game, the board to aim for, and what in the list sets it up.

- **Combos** (up to 3, most-played first, Spellbook's featured picks ahead of ties):
  - What the combo produces, and Spellbook's prerequisites as the board to aim for.
  - Mana to assemble it, tutors to find the pieces, and protection or counterspells to keep it alive.
  - If it doesn't win on its own: which payoff turns endless death or enter triggers into a kill, or what to spend infinite mana on (X spells, X abilities).
  - Whether a finisher in the deck is also a combo piece.
- **Finishers**, one entry per kind (overrun, drain, burn, alternate win, poison, extra combat, mill, draw-trigger damage, big threat):
  - How that kind ends the game, and the board state to aim for, using the deck's own numbers (creatures, token makers, sacrifice outlets, draw engines, proliferate).
  - Alternate-win cards quote their winning line.
- **The commander:** commander damage for voltron decks, or the commander itself when it's a finisher.
- **Big threats** as a fallback when nothing else qualifies.

Key cards are just names with a short tag (ramp, card advantage, high synergy…).

## Commander Spellbook

The builder asks Spellbook for every combo the deck plus your 300 best bench cards can make (`find-my-combos`), not just ones on a list. Combos are ordered by popularity (EDHREC decks running them, per Spellbook), and the builder's combo pass weights it at 1.5 × log10(popularity). Spellbook's featured combos (`variants/?q=is:featured`, cached daily) get +2 and a "Featured" tag.

## Upgrade pipeline (`builder/upgrade.ts`)

1. Resolve the imported list on Scryfall and score it with the **same scorer** as the builder.
2. Score your collection against the same commander and EDHREC data. That gives the bench.
3. Cut illegal and off-colour cards first.
4. Make swaps one at a time, always the single best available. The best swap is the largest score gain after these adjustments:
   - −3 if it opens a hole in a role quota.
   - +2 if it fills one.
   - A small bonus for lowering the curve.
   - Lands only swap with lands. Bracket caps are respected.
   - The dead-weight check applies here too. A card already in the list that its deck can't support scores 4 lower, so it goes early, and its swap says why. A bench card the deck couldn't support is never swapped in.
5. Stop at the swap limit, or when nothing beats the current card by the minimum improvement.
6. Write the reasons from the facts, for example "Played in 81% of Lathliss decks on EDHREC (429 decks)". Before and after, compare power, average mana value, roles and EDHREC match %.

## Where it's still weak, and how to improve without AI

Ordered by payoff:

1. ✅ **Done: use the average deck as a template, not just a bonus.** When you own at least 40% of the EDHREC average deck, the build starts from your owned non-land cards in it and backfills only the gaps (see Fill above).
2. ✅ **Done: weight the EDHREC lists by section.** "High synergy" and "top cards" now outweigh plain type lists, and "new cards" count for less (see Score above).
3. ✅ **Done: land count and curve from EDHREC, not constants.** The land count and curve caps come from the commander page's `panels.piechart` / type counts and `panels.mana_curve`. Role quotas (10 ramp / 10 draw / 8 removal) are still fixed, because EDHREC gives card types, not roles.

   Measured on Matt's collection, bracket 3. "Overlap" is non-basic cards shared with EDHREC's average deck for the tag.

   | Deck | Overlap before → after | Lands before → after | Avg mana value before → after |
   |---|---|---|---|
   | Lathliss, Dragon Queen (Dragons) | 53 → 54 (all 54 owned) | 36 → 36 | 3.75 → 3.81 (EDHREC 3.87) |
   | Magnus the Red (Spellslinger) | 48 → 50 (all 50 owned) | 36 → 34 | 2.92 → 3.02 (EDHREC 3.20) |
4. **Combo-aware brackets.** Spellbook tags combos (Ruthless, Spicy, Powerful, …). Automatically swap out a piece of any combo the target bracket forbids, instead of only warning.
5. **Better role coverage.**
   - About half of eligible cards get a Tagger role; the rest fall back to regexes.
   - Pull more tags (`card-advantage`, `mana-rock`, `mana-dork`, `sweeper-creature`, `land-ramp`), and creature-type synergy tags for tribal.
   - Re-run `npm run roles` after each set release.
6. **Card-pair synergy.** EDHREC's per-card pages ("cards that go well with X") can score two-card packages, such as a sac outlet plus an aristocrats payoff.
7. **Learn from your own edits.** If you keep re-adding a card the engine cut, record a personal +score for it. That's cheap and local, with no model needed.
8. **Tune weights against real lists.** Take 50 popular EDHREC decks, rebuild each from the deck's own cards plus noise, and measure how many of the real 99 the engine picks. Adjust the weights in `makeScorer` until overlap stops improving. This is the non-AI equivalent of "training".

## Where AI still helps (optional)

The Claude pass (`builder/ai.ts`) only proposes swaps from your own bench, and every swap is validated. It's useful for nuance the numbers miss: anti-synergies, a combo line, an under-played gem. Turn it on per build. Set `DECKBIT_DISABLE_AI=1` to block it server-wide when sharing.

## Being a good API citizen

EDHREC and Spellbook responses are cached on disk in `.cache/` for 24 hours. Scryfall lookups are batched 75 at a time. If many friends use one server, the cache means each commander page is fetched about once a day, not once per build.
