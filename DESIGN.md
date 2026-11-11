# BulkBrew — design system

## Direction
"Night harbour, 8-bit." A moonlit navy sea seen from a dark cliff, one hot orange lamp. Every element sits on a 4px grid. No rounded corners, no gradients-as-decoration, no drop-shadow blur: shadows are hard offsets, borders are stepped.

## Palette (CSS custom properties in `src/app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| `--navy-900` | #070c17 | deepest background, hero, inputs |
| `--navy-800` | #0b1324 | page background |
| `--navy-700` | #111c33 | panels |
| `--navy-600` | #182544 | dividers, hover rows |
| `--line` / `--line-strong` | #2a3756 / #3b4c76 | stepped borders |
| `--cream` | #f3e9d2 | primary text |
| `--cream-dim` | #b9b2a0 | body text |
| `--muted` | #8794b3 | labels, hints |
| `--orange` | #ff5a2c | the one accent: CTAs, active state, headings |
| `--orange-deep` | #c43d13 | button border/shadow |
| `--gold` | #e9c67c | moon, warnings, "game changer" tags |
| `--sea` / `--sea-light` | #1e3a6e / #35569a | hero water |
| `--green` | #6fd08c | success |

Orange is rationed: one primary button per view, section headings, active chips. Never orange on orange.

## Type
- **Wordmark only**: Press Start 2P (the BulkBrew logo and the hero headline). Never anywhere else.
- **UI and headings**: Pixelify Sans 600/700, 11–24px, for headings, labels, buttons, chips and nav.
- **Body**: Pixelify Sans 400. `font-size-adjust: 0.4` normalises lowercase height, so component px sizes (14–21px) read the same in either font.
- **Readable mode**: the header's "Aa" toggle sets `html[data-font="readable"]`, swapping all text except the wordmark to Atkinson Hyperlegible. It's saved per device and applied before first paint by an inline script in `layout.tsx`. Readability is a product requirement (see PRODUCT.md), so body text must never return to a thin pixel face like VT323.

## Components (`src/components/ui.tsx`)
- `.px-border` — notched-corner border built from four box-shadows. Add `-orange` / `-gold` / `-strong` tones.
- `.px-btn` — hard 8px offset shadow, collapses on `:active`. `px-btn-ghost` for secondary.
- `.px-chip` — toggleable tags, `aria-pressed` drives the orange state.
- `.px-input` — navy-900 field, orange border on focus.
- `.px-progress` — striped orange fill, stepped transition.
- Sprites: `src/components/sprites.tsx` renders string grids as crisp SVG rects: castle, dragon, wizard, leviathan, kraken tentacle, moon, tome, sword, die, anvil, and 11×11 nav icons. No boats. Follow `.claude/skills/pixel-art-skill`.
- Mana symbols: `src/components/mana.tsx` draws Magic's own symbol language on a 16×16 grid: discs in the official symbol colours (W #fffbd5, U #aae0fa, B #cbc2bf, R #f9aa8f, G #9bd3ae, C/generic #ccc2c0), black glyphs (sun, drop, skull, fireball, tree, hollow diamond, Phyrexian, snow) and a one-pixel navy drop shadow down-left. Generic costs use a grey disc with a bold Pixelify numeral. Shown only at 16 or 32 px so art pixels stay square. Never coloured squares.
- App icon: a hand-drawn 24×24 cauldron (moonlit iron, orange brew, a card rising out, fire beneath) in `scripts/build-icons.mjs`. It renders PNGs (192/512, maskable with a 15% safe pad, Apple 180) and `icon.svg`, with provenance embedded. Run it with `npm run icons`. The nav uses the 11×11 `ICON_CAULDRON` sprite.
- Hero scene: `src/components/pixel/` holds a tiny screen engine (`screen.ts`) and the courtyard (`brew-scene.ts`): 200×120 art pixels at 10 fps, moonlight from the upper left and firelight from below quantised to four-tone ramps. It's drawn into a canvas at the largest integer scale (`brew-canvas.tsx`), and narrow screens crop to the cauldron rather than shrinking. It pauses off-screen and shows a still frame under reduced motion.
- Big numerals: `pixel/pixel-number.tsx` is a 5×7 bitmap face with a lit top edge and a shaded bottom row. The text stays in the DOM.

## Motion
Stepped only (`steps()`), never eased. Twinkle, sea shimmer, cursor blink, the dragon flying across the hero, and the bob of the leviathan and tentacles. All are off under `prefers-reduced-motion`.

## Layout
- Max width 72rem, 16px gutters, 4px-multiple spacing.
- Desktop (lg+): top bar with icon links (Collection, Build, Roll, Upgrade), a **Saved ▾** menu (Saved decks, Reference decks, Wishlist), the Aa toggle and the account button.
- Mobile: fixed bottom tab bar with 6 icon tabs (Home, Cards, Build, Roll, Upgrade, Saved) and safe-area padding. Main content gets `pb-tabbar`. The Saved pages share a tab strip.
- Builder: 400px options column + fluid result column; stacks on mobile.
- Tables scroll horizontally inside their panel; nothing else scrolls sideways.

## Accessibility
- Contrast: cream on navy-800 ≈ 14:1; muted on navy-700 ≈ 5:1; orange on navy-900 ≈ 6:1.
- Focus ring: 4px orange outline, offset 2px.
- Chips use `aria-pressed`; progress bars expose `role=progressbar`.
- Scanline overlay is `pointer-events: none`, low opacity, multiply blend.
