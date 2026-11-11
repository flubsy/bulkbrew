# Deckbit

Build the strongest Magic: The Gathering deck from the cards you already own. 8-bit night-harbour look, mobile-first, installable as a PWA.

## What it does

1. **Import your collection** — CSV/XLSX from ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, TCGplayer, or any sheet with a name column; or paste a list. Rows are matched to Scryfall for types, oracle text, legality, colour identity, EDHREC rank, game-changer status and prices.
2. **Add reference decks** — Moxfield / Archidekt / MTGGoldfish / Deckstats / TappedOut links, or pasted text. Cards that appear across them score higher if you own them.
3. **Build** — choose format, commander (and partner), bracket, theme/gimmick (tribal with a creature type, artifacts, counters, tokens, …), budget, per-card price cap, sets, must-include / never-use lists. The rules engine fills role quotas (ramp, draw, removal, wipes, finishers), keeps the curve sane and builds a mana base from your lands. Optionally Claude refines the list with validated swaps from your own bench.
4. **Export** — copy text, download .txt (Moxfield/Archidekt importable) or .csv.

Everything is stored in the browser (IndexedDB). The server routes are stateless helpers for Scryfall, scraping and the AI pass.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to enable the AI pass
npm run dev
```

Open http://localhost:3000. On a phone on the same network, use your machine's LAN address; "Add to Home Screen" installs it.

## Project layout

```
src/app/                 pages (home, /collection, /decks, /build) + API routes
src/app/api/scryfall     batch card lookup (75 per call, Scryfall rate-limit friendly)
src/app/api/scrape       deck scrapers
src/app/api/build        heuristic build + optional AI refinement
src/lib/csv.ts           import parsing + header detection
src/lib/scryfall.ts      Scryfall client + card normalisation
src/lib/scrapers.ts      Moxfield / Archidekt / MTGGoldfish / Deckstats / TappedOut
src/lib/builder/         classify (roles, themes), heuristic (scoring + filling), ai (Claude pass)
src/lib/db.ts            Dexie schema
src/components/          UI kit, sprites, page components
```

## Notes on sources

- **Moxfield** fronts its API with bot protection. Links often fail from a server; the UI tells you to paste the exported text instead. If Moxfield has issued you a User-Agent, set `MOXFIELD_USER_AGENT`.
- **Archidekt** has a public JSON API; works for public decks.
- **MTGGoldfish** text downloads work for `/deck/{id}` and archetype pages.
- Collection imports from Moxfield/Archidekt accounts need their CSV export (their collection APIs require login).

## Design

See `DESIGN.md` for the visual system and `PRODUCT.md` for the product brief. Lint the UI for generic-AI design patterns with:

```bash
npx impeccable detect src/
```
