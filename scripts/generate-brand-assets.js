// Rasterises the committed SVG brand sources in public/images/brand into
// every PNG size the web app, PWA manifest and native shells need, plus a
// multi-resolution favicon.ico and the Open Graph share image.
//
//   node scripts/generate-brand-assets.js
//
// The generated files are committed, so this only needs running when the
// artwork itself changes. It renders through the Playwright Chromium that
// ships with this repo's dev setup rather than an image library, which
// keeps the runtime dependency list unchanged - if Playwright isn't
// installed the script says so and stops without touching anything.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const BRAND = path.join(ROOT, 'public', 'images', 'brand');
const ICONS = path.join(ROOT, 'public', 'icons');

// icon-tile.svg deliberately keeps the glyph inside the maskable safe zone
// (its diagonal is ~390px on a 512px tile, under the 409.6px safe circle), so
// one full-bleed render serves both "any" and "maskable" purposes. Padding the
// render instead would leave transparent corners for a launcher mask to crop.
const ICON_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512];
const FAVICON_ICO_SIZES = [16, 32, 48];

function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    console.error(
      'This script needs Playwright (a dev-only dependency) to rasterise the SVGs.\n' +
      'The generated PNG/ICO files are committed, so you only need this when changing the artwork:\n' +
      '  npm install --no-save playwright'
    );
    process.exit(1);
  }
}

async function renderSvg(page, svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<body style="margin:0;width:${width}px;height:${height}px">` +
    `<style>svg{width:100%;height:100%;display:block}</style>${svg}</body>`
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

// Minimal ICO container. Modern Windows/browsers accept PNG-encoded entries,
// so each size is embedded as the PNG we already rendered.
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  const chromium = loadChromium();
  const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(
    fs.existsSync(executablePath) ? { executablePath } : {}
  );
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const tile = fs.readFileSync(path.join(BRAND, 'icon-tile.svg'), 'utf8');
  const favicon = fs.readFileSync(path.join(ROOT, 'public', 'favicon.svg'), 'utf8');
  const horizontalLight = fs.readFileSync(path.join(BRAND, 'logo-horizontal-light.svg'), 'utf8');

  fs.mkdirSync(ICONS, { recursive: true });

  // Small sizes come from the favicon artwork (bigger glyph, rounded tile)
  // because the full-bleed tile turns to mush below ~48px.
  for (const size of ICON_SIZES) {
    const source = size <= 48 ? favicon : tile;
    const png = await renderSvg(page, source, size, size);
    fs.writeFileSync(path.join(ICONS, `icon-${size}.png`), png);
  }
  console.log(`Wrote ${ICON_SIZES.length} icons to public/icons/`);

  const icoParts = [];
  for (const size of FAVICON_ICO_SIZES) {
    icoParts.push({ size, data: await renderSvg(page, favicon, size, size) });
  }
  fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), buildIco(icoParts));
  console.log(`Wrote public/favicon.ico (${FAVICON_ICO_SIZES.join(', ')}px).`);

  // Open Graph card: the lockup on the brand gradient, at the 1.91:1 ratio
  // Facebook/LinkedIn/Slack/X all crop to.
  const og = `
    <div style="width:1200px;height:630px;box-sizing:border-box;padding:86px 96px;
                display:flex;flex-direction:column;justify-content:center;gap:30px;
                background:linear-gradient(135deg,#11618f 0%,#0a3d62 58%,#072a44 100%);
                font-family:Inter,Helvetica,Arial,sans-serif;position:relative;overflow:hidden">
      <div style="position:absolute;right:-120px;bottom:-160px;width:620px;height:620px;
                  border-radius:50%;background:rgba(232,135,74,.13)"></div>
      <div style="width:470px;position:relative">${horizontalLight}</div>
      <div style="color:#fff;font-size:60px;font-weight:800;letter-spacing:-.025em;
                  line-height:1.1;max-width:820px;position:relative">
        Share container space.<br>Ship for less.
      </div>
      <div style="color:#a9c6db;font-size:29px;font-weight:500;position:relative">
        Find an open container on your route &mdash; or list your own departure.
      </div>
    </div>`;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<body style="margin:0">${og}</body>`);
  fs.writeFileSync(
    path.join(ROOT, 'public', 'images', 'og-fallback.png'),
    await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } })
  );
  console.log('Wrote public/images/og-fallback.png (1200x630).');

  await writeNativeAssets(page, { tile, markLight: fs.readFileSync(path.join(BRAND, 'logo-mark-light.svg'), 'utf8') });
  await writeLockupPngs(page);

  await browser.close();
}

// Transparent PNG exports of the lockups, for anywhere the SVG can't be used
// (a deck, an email signature, a partner's site). An SVG loaded through <img>
// can't fetch web fonts, so the wordmark would silently fall back there; these
// are rendered in a page where Inter is a real installed font.
async function writeLockupPngs(page) {
  const outDir = path.join(BRAND, 'png');
  fs.mkdirSync(outDir, { recursive: true });

  const lockups = [
    ['logo-horizontal.svg', 'logo-horizontal-navy'],
    ['logo-horizontal-light.svg', 'logo-horizontal-white'],
    ['logo-stacked.svg', 'logo-stacked-navy'],
    ['logo-wordmark.svg', 'logo-wordmark-navy'],
    ['logo-mark.svg', 'logo-mark-navy'],
    ['logo-mark-light.svg', 'logo-mark-white'],
  ];

  const hasInter = await page.evaluate(() => document.fonts.check('16px Inter'));
  if (!hasInter) {
    console.warn('  ! Inter is not installed; wordmark PNGs would use a fallback face. Skipping lockup PNGs.');
    return;
  }

  for (const [file, name] of lockups) {
    const svg = fs.readFileSync(path.join(BRAND, file), 'utf8');
    const viewBox = svg.match(/viewBox="([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)"/);
    if (!viewBox) throw new Error(`${file} has no parsable viewBox`);
    const vbW = Number(viewBox[3]);
    const vbH = Number(viewBox[4]);

    for (const width of [600, 1200]) {
      const height = Math.round((width * vbH) / vbW);
      const suffix = width === 1200 ? '@2x' : '';
      fs.writeFileSync(
        path.join(outDir, `${name}${suffix}.png`),
        await renderSvg(page, svg, width, height)
      );
    }
  }
  console.log(`Wrote ${lockups.length * 2} lockup PNGs to public/images/brand/png/.`);
}

// Splash art is laid out in HTML rather than SVG because the same design has
// to fill a dozen different aspect ratios without letterboxing.
async function renderSplash(page, markLight, width, height) {
  const glyph = Math.round(Math.min(width, height) * 0.22);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<body style="margin:0;width:${width}px;height:${height}px;display:flex;
       align-items:center;justify-content:center;
       background:linear-gradient(135deg,#11618f 0%,#0a3d62 58%,#072a44 100%)">
       <div style="width:${glyph}px">
         <style>svg{width:100%;height:auto;display:block}</style>${markLight}
       </div></body>`
  );
  return page.screenshot({ clip: { x: 0, y: 0, width, height } });
}

async function writeNativeAssets(page, { tile, markLight }) {
  const foreground = fs.readFileSync(path.join(BRAND, 'icon-foreground.svg'), 'utf8');
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };

  const iosIconDir = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  if (fs.existsSync(path.dirname(iosIconDir))) {
    write(path.join(iosIconDir, 'AppIcon-512@2x.png'), await renderSvg(page, tile, 1024, 1024));
    const splashDir = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
    const splashPng = await renderSplash(page, markLight, 2732, 2732);
    for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
      write(path.join(splashDir, name), splashPng);
    }
    console.log('Wrote iOS app icon + splash screens.');
  } else {
    console.log('Skipping iOS assets (run `npx cap add ios` first).');
  }

  const androidRes = path.join(ROOT, 'android/app/src/main/res');
  if (fs.existsSync(androidRes)) {
    const launcher = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

    for (const [density, size] of Object.entries(launcher)) {
      const png = await renderSvg(page, tile, size, size);
      write(path.join(androidRes, `mipmap-${density}`, 'ic_launcher.png'), png);
      write(path.join(androidRes, `mipmap-${density}`, 'ic_launcher_round.png'), png);
    }
    for (const [density, size] of Object.entries(adaptive)) {
      write(
        path.join(androidRes, `mipmap-${density}`, 'ic_launcher_foreground.png'),
        await renderSvg(page, foreground, size, size)
      );
    }

    const splashes = {
      'drawable': [480, 320],
      'drawable-port-mdpi': [320, 480],
      'drawable-port-hdpi': [480, 800],
      'drawable-port-xhdpi': [720, 1280],
      'drawable-port-xxhdpi': [960, 1600],
      'drawable-port-xxxhdpi': [1280, 1920],
      'drawable-land-mdpi': [480, 320],
      'drawable-land-hdpi': [800, 480],
      'drawable-land-xhdpi': [1280, 720],
      'drawable-land-xxhdpi': [1600, 960],
      'drawable-land-xxxhdpi': [1920, 1280],
    };
    for (const [dir, [w, h]] of Object.entries(splashes)) {
      write(path.join(androidRes, dir, 'splash.png'), await renderSplash(page, markLight, w, h));
    }
    console.log('Wrote Android launcher, adaptive foreground and splash assets.');
  } else {
    console.log('Skipping Android assets (run `npx cap add android` first).');
  }

  write(path.join(ROOT, 'resources/icon.png'), await renderSvg(page, tile, 1024, 1024));
  write(path.join(ROOT, 'resources/splash.png'), await renderSplash(page, markLight, 2732, 2732));
  console.log('Wrote resources/ masters.');
}

main().catch((err) => {
  console.error('Brand asset generation failed:', err);
  process.exit(1);
});
