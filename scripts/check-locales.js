const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
const keysByLang = {};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const data = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
  keysByLang[lang] = new Set(flattenKeys(data));
}

const allKeys = new Set();
for (const keys of Object.values(keysByLang)) {
  for (const k of keys) allKeys.add(k);
}

let hasMismatch = false;
for (const [lang, keys] of Object.entries(keysByLang)) {
  const missing = [...allKeys].filter((k) => !keys.has(k));
  if (missing.length > 0) {
    hasMismatch = true;
    console.log(`Missing in ${lang}.json (${missing.length}):`);
    for (const key of missing) console.log(`  - ${key}`);
  }
}

if (hasMismatch) {
  process.exitCode = 1;
} else {
  console.log(`All ${files.length} locale files have matching keys (${allKeys.size} keys each).`);
}
