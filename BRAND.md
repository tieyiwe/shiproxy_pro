# ShiProxy brand assets

## The mark

An orange **S** routed through a shipping container. The S is ShiProxy's
initial; drawn as a path that threads through the container body it also says
what the product is — your parcel moving through space inside someone else's
container.

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#0a3d62` | Container body on light grounds, wordmark, UI primary |
| Navy deep | `#072a44` | Gradient end on the icon tile |
| Navy light | `#11618f` | Gradient start on the icon tile |
| Orange | `#e8874a` | The S, and only the S — one accent moment per lockup |
| White | `#ffffff` | Container body on dark grounds |

## Files

Sources live in `public/images/brand/` and are the things to edit.

| File | What it is |
| --- | --- |
| `logo-mark.svg` | Mark alone, navy body — light backgrounds |
| `logo-mark-light.svg` | Mark alone, white body — dark backgrounds |
| `logo-horizontal.svg` | Mark + wordmark, side by side |
| `logo-horizontal-light.svg` | Same, reversed for dark backgrounds |
| `logo-stacked.svg` | Mark above wordmark, for square spaces |
| `logo-wordmark.svg` | Wordmark alone |
| `icon-tile.svg` | Full-bleed gradient tile — the app icon master |
| `../../favicon.svg` | Rounded tile with a larger glyph — the small-size master |

Generated from those, by `node scripts/generate-brand-assets.js`:

- `public/icons/icon-{16,32,48,64,96,128,180,192,256,384,512}.png`
- `public/favicon.ico` (16 / 32 / 48 in one file)
- `public/images/og-fallback.png` (1200×630 share card)

The generated files are committed, so the script only needs re-running when
the artwork changes. It rasterises through Playwright's Chromium, which is a
dev-only tool — `npm install --no-save playwright` if it isn't present. No
runtime dependency was added.

## Two masters, on purpose

`icon-tile.svg` gives the glyph generous margins; below about 48px that turns
to mush, so `favicon.svg` is a separate drawing with a fatter stroke and a
bigger panel. The generator picks the small master for ≤48px and the tile
above it. If you redraw one, redraw both.

## Maskable icons

`icon-tile.svg` keeps the glyph inside the maskable safe zone — its diagonal
is ~390px on a 512px tile, comfortably under the 409.6px safe circle — so one
full-bleed render serves both `any` and `maskable` purposes in the manifest.
Do not pad the render to "make it safe": that leaves transparent corners for a
launcher mask to crop into.

## Using it

- One accent moment: the S is orange, everything else is navy or white. The
  wordmark stays single-colour.
- On the navy sidebar use the reversed mark (`logo-mark-light.svg`) with the
  wordmark as live HTML text, so it picks up Inter from the page.
- On light surfaces use the tile (`favicon.svg`), which carries its own
  gradient ground.
- Clear space: at least the height of the container body on every side.
- Don't recolour the S, stretch the lockup, or put the navy mark on a dark
  ground.

## Wordmark and fonts

The lockup SVGs set the wordmark as live text in Inter with a system fallback
stack. Inter is loaded by the app, so it renders correctly in-product. An SVG
loaded through `<img>` can't fetch web fonts, so for anything outside the app
(a deck, an email signature, a partner's site) export a PNG rather than
shipping the SVG.
