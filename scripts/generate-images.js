// Generates placeholder PNG assets (PWA icons + Open Graph fallback image)
// with zero image-processing dependencies, so there's no native binary in
// the dependency tree. Produces a simple navy "container" glyph. Intended
// as a placeholder until real brand assets are designed.
const fs = require('fs');
const path = require('path');
const { encodePng } = require('./lib/png');

const NAVY = [10, 61, 98];
const WHITE = [255, 255, 255];

function pixelColor(x, y, w, h) {
  const left = w * 0.15;
  const right = w * 0.85;
  const top = h * 0.36;
  const bottom = h * 0.64;
  if (x >= left && x < right && y >= top && y < bottom) {
    const seamWidth = Math.max(1, w * 0.012);
    const cx = w / 2;
    if (Math.abs(x - cx) < seamWidth) return NAVY;
    return WHITE;
  }
  return NAVY;
}

const iconSizes = [16, 32, 180, 192, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
for (const size of iconSizes) {
  const png = encodePng(size, size, pixelColor);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Wrote icons/icon-${size}.png`);
}

const imagesDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(imagesDir, { recursive: true });
const ogImage = encodePng(1200, 630, pixelColor);
fs.writeFileSync(path.join(imagesDir, 'og-fallback.png'), ogImage);
console.log('Wrote images/og-fallback.png');
