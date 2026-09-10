// Generates placeholder PNG assets (PWA icons + Open Graph fallback image)
// with zero image-processing dependencies, so there's no native binary in
// the dependency tree. Produces a simple navy "container" glyph. Intended
// as a placeholder until real brand assets are designed.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [10, 61, 98];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

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

function encodePng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelColor(x, y, width, height);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const iconSizes = [16, 32, 180, 192, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
for (const size of iconSizes) {
  const png = encodePng(size, size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Wrote icons/icon-${size}.png`);
}

const imagesDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(imagesDir, { recursive: true });
const ogImage = encodePng(1200, 630);
fs.writeFileSync(path.join(imagesDir, 'og-fallback.png'), ogImage);
console.log('Wrote images/og-fallback.png');
