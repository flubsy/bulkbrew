# How BulkBrew builds and upgrades decks

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
   - EDHREC for this commander/tag: `synergy × 6 + inclusion × 6 + 1.5`, weighted by list section. "High synergy" and "top cards" get ×1.25 +1.5, "high lift" ×1.1 +0.5, "new cards" ×0.6. A card in several lists keeps its strongest section.
   - In EDHREC's average deck: +4.
   - Reference-deck frequency.
   - Role bonus and efficiency: cheap ramp and interaction score higher.
   - Bracket policy: game changers, extra turns, mass land denial and fast mana are penalised or capped by bracket.
4. **Fill.**
   - Must-includes go in first.
   - **Average-deck template.** If you own at least 40% of the non-basic cards in EDHREC's average deck, every owned non-land card from it goes in next, as long as it passes the bracket and budget rules. A note on the deck says so.
   - Then role quotas, e.g. Commander: 10 ramp, 10 draw, 8 removal, 2 wipes; these shift by theme. The land count comes from EDHREC's average deck for the commander and tag (`panels.piechart` / type counts), clamped to 30–42; it falls back to 36 plus theme tweaks.
   - Then the best remaining cards, under curve caps and soft role ceilings. With EDHREC's `panels.mana_curve`, each mana value from 3 up gets roughly its share of the average deck. Mana values 0–2 are uncapped, and any slot the caps leave empty goes to the next-best spell, not an extra land. Without EDHREC, fixed caps apply, and they relax for top-heavy themes like Dragons.
5. **Mana base.** Nonbasic lands are scored for the colours you actually use. Basics are split by colour-pip share.
6. **Check.**
   - Power rating (`builder/power.ts`): curve, ramp and fast mana, tutors, interaction, draw, game changers, staple density, finishers and synergy.
   - Commander Spellbook combo scan, with a bracket warning.
   - Alternatives you own, and an EDHREC wishlist of cards you don't.

## Upgrade pipeline (`builder/upgrade.ts`)

1. Resolve the imported list on Scryfall and score it with the **same scorer** as the builder.
2. Score your collection against the same commander and EDHREC data. That gives the bench.
3. Cut illegal and off-colour cards first.
4. Make swaps one at a time, always the single best available. The best swap is the largest score gain after these adjustments:
   - −3 if it opens a hole in a role quota.
   - +2 if it fills one.
   - A small bonus for lowering the curve.
   - Lands only swap with lands. Bracket caps are respected.
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

The Claude pass (`builder/ai.ts`) only proposes swaps from your own bench, and every swap is validated. It's useful for nuance the numbers miss: anti-synergies, a combo line, an under-played gem. Turn it on per build. Set `BULKBREW_DISABLE_AI=1` to block it server-wide when sharing.

## Being a good API citizen

EDHREC and Spellbook responses are cached on disk in `.cache/` for 24 hours. Scryfall lookups are batched 75 at a time. If many friends use one server, the cache means each commander page is fetched about once a day, not once per build.
