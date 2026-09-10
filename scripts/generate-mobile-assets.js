// Generates placeholder native app icons + splash screens for the Capacitor
// iOS/Android projects, at the exact paths/sizes those templates expect.
// Zero image-processing dependencies (see scripts/lib/png.js) - swap these
// files for real brand assets before submitting to the app stores.
const fs = require('fs');
const path = require('path');
const { encodePng } = require('./lib/png');

const NAVY = [10, 61, 98];
const WHITE = [255, 255, 255];
const ROOT = path.join(__dirname, '..');

// Opaque square icon: navy background, white container glyph - same look as
// the web favicon/PWA icons in generate-images.js.
function flatIcon(x, y, w, h) {
  const left = w * 0.15;
  const right = w * 0.85;
  const top = h * 0.36;
  const bottom = h * 0.64;
  if (x >= left && x < right && y >= top && y < bottom) {
    const seamWidth = Math.max(1, w * 0.012);
    if (Math.abs(x - w / 2) < seamWidth) return NAVY;
    return WHITE;
  }
  return NAVY;
}

// Android adaptive icon foreground: transparent background, glyph confined
// to the center ~66% "safe zone" so it isn't clipped by circle/squircle/
// rounded-square launcher masks.
function adaptiveForeground(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const safe = Math.min(w, h) * 0.33;
  const left = cx - safe;
  const right = cx + safe;
  const top = cy - safe * 0.5;
  const bottom = cy + safe * 0.5;
  if (x >= left && x < right && y >= top && y < bottom) {
    const seamWidth = Math.max(1, safe * 0.05);
    if (Math.abs(x - cx) < seamWidth) return [10, 61, 98, 255];
    return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
}

// Splash screen: solid navy field with a centered white glyph, matching the
// SplashScreen plugin's configured backgroundColor in capacitor.config.json.
function splash(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const glyphW = Math.min(w, h) * 0.22;
  const glyphH = glyphW * 0.6;
  const left = cx - glyphW / 2;
  const right = cx + glyphW / 2;
  const top = cy - glyphH / 2;
  const bottom = cy + glyphH / 2;
  if (x >= left && x < right && y >= top && y < bottom) {
    const seamWidth = Math.max(1, glyphW * 0.02);
    if (Math.abs(x - cx) < seamWidth) return NAVY;
    return WHITE;
  }
  return NAVY;
}

function write(filePath, width, height, pixelFn, opts) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodePng(width, height, pixelFn, opts));
  console.log('Wrote', path.relative(ROOT, filePath));
}

// --- iOS ---
const iosAppIconDir = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
if (fs.existsSync(path.dirname(iosAppIconDir))) {
  write(path.join(iosAppIconDir, 'AppIcon-512@2x.png'), 1024, 1024, flatIcon);

  const splashDir = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
  const splashPng = encodePng(2732, 2732, splash);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    fs.mkdirSync(splashDir, { recursive: true });
    fs.writeFileSync(path.join(splashDir, name), splashPng);
    console.log('Wrote', path.relative(ROOT, path.join(splashDir, name)));
  }
} else {
  console.log('Skipping iOS assets (run `npx cap add ios` first)');
}

// --- Android ---
const androidResDir = path.join(ROOT, 'android/app/src/main/res');
if (fs.existsSync(androidResDir)) {
  const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

  for (const [density, size] of Object.entries(launcherSizes)) {
    const dir = path.join(androidResDir, `mipmap-${density}`);
    write(path.join(dir, 'ic_launcher.png'), size, size, flatIcon);
    write(path.join(dir, 'ic_launcher_round.png'), size, size, flatIcon);
  }
  for (const [density, size] of Object.entries(foregroundSizes)) {
    const dir = path.join(androidResDir, `mipmap-${density}`);
    write(path.join(dir, 'ic_launcher_foreground.png'), size, size, adaptiveForeground, { alpha: true });
  }

  const splashSizes = {
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
  for (const [dir, [w, h]] of Object.entries(splashSizes)) {
    write(path.join(androidResDir, dir, 'splash.png'), w, h, splash);
  }
} else {
  console.log('Skipping Android assets (run `npx cap add android` first)');
}

// --- Source-of-truth masters, for anyone regenerating a professional set later ---
write(path.join(ROOT, 'resources/icon.png'), 1024, 1024, flatIcon);
write(path.join(ROOT, 'resources/splash.png'), 2732, 2732, splash);
