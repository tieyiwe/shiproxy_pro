const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const DEFAULT_LANG = 'fr';
const FALLBACK_LANG = 'en';

// French and English are the app's primary languages; the rest are
// secondary. This ordering only affects display (e.g. the language
// switcher) - the fr -> en fallback chain in translate() below already
// reflects the same priority regardless of this list's order.
const LANGUAGE_PRIORITY = ['fr', 'en', 'de', 'es', 'sw'];

const catalogs = {};
const filesOnDisk = new Set();

for (const file of fs.readdirSync(LOCALES_DIR).sort()) {
  if (!file.endsWith('.json')) continue;
  const lang = path.basename(file, '.json');
  catalogs[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
  filesOnDisk.add(lang);
}

const supportedLanguages = [
  ...LANGUAGE_PRIORITY.filter((lang) => filesOnDisk.has(lang)),
  ...[...filesOnDisk].filter((lang) => !LANGUAGE_PRIORITY.includes(lang)).sort(),
];

function lookup(catalog, key) {
  const parts = key.split('.');
  let node = catalog;
  for (const part of parts) {
    if (node == null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

function translate(lang, key, vars) {
  const chain = [lang, DEFAULT_LANG, FALLBACK_LANG];
  for (const candidate of chain) {
    const catalog = catalogs[candidate];
    if (!catalog) continue;
    const value = lookup(catalog, key);
    if (value !== undefined) return interpolate(value, vars);
  }
  return key;
}

function resolveLang(requested) {
  return supportedLanguages.includes(requested) ? requested : DEFAULT_LANG;
}

function middleware(req, res, next) {
  const queryLang = req.query.lang;
  const explicitChange = queryLang && supportedLanguages.includes(queryLang);
  if (explicitChange) {
    res.cookie('lang', queryLang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    // Switching the language while logged in is also how a user changes
    // their saved preference - there's no separate settings toggle for it.
    if (req.user) {
      // Fire-and-forget: this only affects which language later requests
      // resolve to, never the response already being rendered.
      require('../db').sql`UPDATE users SET preferred_lang = ${queryLang} WHERE id = ${req.user.id}`.catch(() => {});
      req.user.preferred_lang = queryLang;
    }
  }
  const lang = resolveLang(queryLang || req.user?.preferred_lang || req.cookies?.lang);
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.languages = supportedLanguages;
  res.locals.t = (key, vars) => translate(lang, key, vars);
  next();
}

module.exports = { translate, resolveLang, middleware, supportedLanguages, DEFAULT_LANG, catalogs };
