// Frees the app's port before `npm start` (wired up as npm's `prestart`).
//
// Replit's Run button does not reliably stop the previous instance. When it
// doesn't, the new process fails to bind and the OLD one keeps serving - so
// EJS templates (re-read from disk every request) come from the new deploy
// while routes and locale JSON (require()d once, then cached in memory) come
// from the old one. That mismatch shows up as 500s on pages whose route
// gained a new template variable, and as untranslated keys for newly added
// strings. Killing the stale listener first makes a restart a real restart.
//
// Best effort by design: every failure here is swallowed, because not being
// able to free the port must never stop the server from trying to start.
const { execSync } = require('child_process');

const PORT = process.env.PORT || 5000;

const strategies = [
  `fuser -k ${PORT}/tcp`,
  `lsof -ti tcp:${PORT} | xargs -r kill`,
  `pkill -f "node .*server\\.js"`,
];

for (const command of strategies) {
  try {
    execSync(command, { stdio: 'ignore', timeout: 5000 });
    console.log(`Freed port ${PORT}.`);
    break;
  } catch {
    // Command missing, or nothing was listening - try the next strategy.
  }
}
