# Deckbit — design system

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
- **Display**: Press Start 2P, 9–34px, uppercase, line-height 1.5–1.6. Used for headings, labels, buttons, chips. Never for paragraphs.
- **Body**: VT323 at 17–21px (it is a small-x-height pixel face; 20px is the comfortable default). Font smoothing off.
- Hierarchy comes from size and colour, not weight (both faces are single-weight).

## Components (`src/components/ui.tsx`)
- `.px-border` — notched-corner border built from four box-shadows. Add `-orange` / `-gold` / `-strong` tones.
- `.px-btn` — hard 8px offset shadow, collapses on `:active`. `px-btn-ghost` for secondary.
- `.px-chip` — toggleable tags, `aria-pressed` drives the orange state.
- `.px-input` — navy-900 field, orange border on focus.
- `.px-progress` — striped orange fill, stepped transition.
- Sprites: `src/components/sprites.tsx` renders string grids as crisp SVG rects (moon, boat, house, card, skull, gear).

## Motion
Stepped only (`steps()`), never eased. Twinkle, sea shimmer and cursor blink are the only animations; all off under `prefers-reduced-motion`.

## Layout
- Max width 72rem, 16px gutters, 4px-multiple spacing.
- Desktop: top bar. Mobile: fixed bottom tab bar (4 tabs) with safe-area padding; main content gets `pb-tabbar`.
- Builder: 400px options column + fluid result column; stacks on mobile.
- Tables scroll horizontally inside their panel; nothing else scrolls sideways.

## Accessibility
- Contrast: cream on navy-800 ≈ 14:1; muted on navy-700 ≈ 5:1; orange on navy-900 ≈ 6:1.
- Focus ring: 4px orange outline, offset 2px.
- Chips use `aria-pressed`; progress bars expose `role=progressbar`.
- Scanline overlay is `pointer-events: none`, low opacity, multiply blend.
