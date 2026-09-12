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

## The logo and the app icon are different drawings

The **logo** is the full mark: the S inside its container body. Use it in
lockups, the sidebar, documents — anywhere there is room to read it.

The **app icon** drops the container and shows the S alone on the navy
gradient. At the size a launcher renders an icon, the container body reduces
to a thin white frame that adds nothing and steals room from the S; the S by
itself is bolder, recognisable at a glance on a crowded home screen, and
still unmistakably the same mark. This is the usual relationship between a
logo and an app icon, not a second brand.

Two icon masters exist for the same reason: `icon-tile.svg` is the full-bleed
launcher tile, and `favicon.svg` is a rounded tile whose S is proportionally
larger so it holds together at 16px. The generator picks the small master for
≤48px and the tile above it. If you redraw one, redraw both.

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
