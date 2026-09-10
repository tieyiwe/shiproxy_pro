const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const DEFAULT_LANG = 'fr';
const FALLBACK_LANG = 'en';

const catalogs = {};
const supportedLanguages = [];

for (const file of fs.readdirSync(LOCALES_DIR).sort()) {
  if (!file.endsWith('.json')) continue;
  const lang = path.basename(file, '.json');
  catalogs[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
  supportedLanguages.push(lang);
}

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
  if (queryLang && supportedLanguages.includes(queryLang)) {
    res.cookie('lang', queryLang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  }
  const lang = resolveLang(queryLang || req.cookies?.lang);
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.languages = supportedLanguages;
  res.locals.t = (key, vars) => translate(lang, key, vars);
  next();
}

module.exports = { translate, resolveLang, middleware, supportedLanguages, DEFAULT_LANG, catalogs };
