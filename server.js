require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');

const { sql } = require('./db');
const { run: runMigrations } = require('./scripts/migrate');
const i18n = require('./lib/i18n');
const { loadUser } = require('./middleware/auth');
const { flash } = require('./middleware/flash');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.statusTier = require('./lib/statusTier').statusTier;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
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

app.use(i18n.middleware);
app.use(loadUser);
app.use(flash);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.baseUrl = `${req.protocol}://${req.get('host')}`;
  next();
});

app.use('/', require('./routes/home'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/containers'));
app.use('/messages', require('./routes/messages'));
app.use('/dashboard', require('./routes/dashboard'));

app.use((req, res) => {
  res.status(404).render('errors/404', { title: '404' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('errors/500', { title: '500' });
});

async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`ShipRoxy listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
