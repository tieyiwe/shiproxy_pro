// Lightweight CSRF mitigation via Origin verification, layered on top of the
// session cookie's SameSite=Lax (which already blocks most cross-site form
// POSTs from carrying the cookie). A real cross-origin attacker's browser
// sets Origin/Referer to the attacker's own page - it cannot be spoofed to
// match this app's host - so a mismatch is rejected. Missing both headers is
// allowed through rather than blocked outright, since some legitimate
// same-origin requests (older browsers, strict privacy extensions/proxies)
// can omit them; the mismatch check is still the layer doing real work here.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function verifyOrigin(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const source = req.get('origin') || req.get('referer');
  // Browsers send the literal string "null" (not an absent header) for some
  // legitimate same-origin cases - e.g. Chromium does this for a plain form
  // POST on a page served with Cross-Origin-Opener-Policy: same-origin,
  // which this app sets via Helmet. Treat it like a missing header rather
  // than a mismatch, or normal signed-in form submissions would be blocked.
  // This doesn't reopen the classic "sandboxed iframe forges Origin: null"
  // CSRF bypass: that attack relies on the session cookie still being sent
  // cross-site, but the cookie's SameSite=Lax flag (see server.js) already
  // blocks it from attaching to a cross-site POST regardless of what this
  // middleware decides - so requireAuth rejects the request unauthenticated
  // before any state-changing handler runs. This check is defense-in-depth
  // on top of that, not the primary defense.
  if (!source || source === 'null') return next();

  let sourceHost;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return res.status(403).send('Forbidden');
  }

  if (sourceHost !== req.get('host')) {
    return res.status(403).send('Forbidden');
  }
  next();
}

module.exports = { verifyOrigin };
