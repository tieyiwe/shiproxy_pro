require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');

const { sql } = require('./db');
const { run: runMigrations } = require('./scripts/migrate');
const i18n = require('./lib/i18n');
const { loadUser } = require('./middleware/auth');
const { flash } = require('./middleware/flash');
const { verifyOrigin } = require('./lib/csrf');

const app = express();
const PORT = process.env.PORT || 5000;

// Replit (and most PaaS hosts) terminate TLS at a reverse proxy in front of
// this process, so Express must trust its X-Forwarded-* headers - otherwise
// req.secure/req.ip are wrong, which breaks the session cookie's `secure`
// flag in production and would make IP-based rate limiting below bucket
// every visitor together under the proxy's own address.
app.set('trust proxy', 1);

// The default query parser (qs) has open moderate advisories with no fixed
// release yet; every route here only ever reads flat string query params
// (see routes/containers.js, routes/auth.js, lib/i18n.js), so the simpler
// built-in parser covers real usage while sidestepping that dependency.
app.set('query parser', 'simple');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.statusTier = require('./lib/statusTier').statusTier;

// CSP is left off for now: several views rely on inline event handler
// attributes (onchange/onclick) that a default CSP would silently break.
// Cross-Origin-Resource-Policy is relaxed to cross-origin: listings and
// ShipBox profiles rely on external sites (Twitter/Facebook/Slack link
// previews) being able to load og:image from /uploads, which Helmet's
// same-origin default would otherwise block. The remaining protections
// (clickjacking, MIME-sniffing, HSTS, etc.) are safe to enable as-is.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(verifyOrigin);
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ createTableIfMissing: true, pruneSessionInterval: 60 * 60 }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

app.use(loadUser);
app.use(i18n.middleware);
app.use(flash);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.baseUrl = `${req.protocol}://${req.get('host')}`;
  next();
});
app.use(async (req, res, next) => {
  if (!req.user) return next();
  try {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ${req.user.id} AND read_at IS NULL
    `;
    res.locals.unreadNotifications = count;
  } catch (err) {
    res.locals.unreadNotifications = 0;
  }
  next();
});

app.use('/', require('./routes/home'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/containers'));
app.use('/containers/:id/packages', require('./routes/packages'));
app.use('/', require('./routes/tracking'));
app.use('/messages', require('./routes/messages'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/team', require('./routes/team'));
app.use('/account', require('./routes/account'));
app.use('/notifications', require('./routes/notifications'));
app.use('/', require('./routes/profile'));
app.use('/', require('./routes/legal'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('errors/404', { title: '404' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('errors/500', { title: '500' });
});

async function start() {
  await runMigrations();
  const server = app.listen(PORT, () => {
    console.log(`ShiProxy listening on port ${PORT}`);
  });

  // Without this the failure is a bare stack trace, and the previous
  // instance keeps serving the old routes/locales against the new
  // templates - which looks like random 500s rather than a failed restart.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use - an older instance is still running and will keep serving stale code.\n` +
        `Stop it first, then start again (npm start runs scripts/free-port.js for you).`
      );
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
