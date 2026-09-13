# ShiProxy — application overview

ShiProxy is a marketplace for **international container-sharing (groupage)**.
People and companies who have booked a shipping container ("groupeurs") list
the spare space they have before departure; senders search those listings by
route, message the owner, and hand over a parcel. Once a parcel is in the
container, the groupeur logs it and the sender and receiver follow it to
delivery through a link that needs no account.

It is a server-rendered Express + EJS + PostgreSQL app, wrapped for the app
stores with Capacitor and installable as a PWA.

---

## 1. Architecture at a glance

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20, Express 4 |
| Views | EJS server-side templates, one stylesheet (`public/css/style.css`), ~70 lines of progressive-enhancement JS |
| Database | PostgreSQL via the `postgres` driver; plain SQL migrations run automatically on boot |
| Sessions | `express-session` + `connect-pg-simple` (session table auto-created), 7-day cookie |
| Auth | Email + bcrypt password hash, session cookie |
| Uploads | `multer` to `public/uploads/`, served statically |
| Email | `nodemailer` over SMTP; logs to console when no SMTP host is configured |
| i18n | Custom JSON-catalog layer, 5 languages |
| Mobile | Capacitor shells (`ios/`, `android/`) loading the deployed web app |

Request pipeline (`server.js`): Helmet → body/cookie parsers → Origin-based
CSRF check → static files → session → `loadUser` → i18n → flash → per-request
locals (current path, base URL, unread-notification count) → routers → 404 /
500 handlers.

### Domain model

`users` → `teams` / `team_members` → `containers` (listings) → `container_photos`,
`container_stops`, `packages` → `package_photos`; plus `conversations` →
`messages`, `ratings`, and `notifications`. 14 forward-only SQL migrations in
`migrations/`, applied by `scripts/migrate.js` at startup.

---

## 2. Features

### Accounts and identity
- Email/password signup and login, bcrypt-hashed, 8-character minimum.
- **Account types** collected at signup — *expediter* (individual sender),
  *shipping company*, *independent shipper*. Business types additionally
  capture business name (required), contact name, phone and location.
  Type is profile data, not a permission gate: anyone can list or ship.
- **Public ID** (`SPxxxxxx`) per account — a human-quotable reference used for
  support and for team invitations by ID.
- **Public handle** (`/u/my-handle`) — optional, unique, validated
  (3–30 chars, lowercase, starts with a letter), backing the shareable
  "ShipBox" storefront page.
- Account settings page: handle, preferred language, account type and
  business details.
- Per-user preferred language, persisted server-side and mirrored to a cookie
  so it follows the user across devices.

### Marketplace listings
- Post a container with: container number, size (20ft, 40ft, 40ft HC, 45ft HC,
  or LCL part-load), origin and destination country/city, available space,
  free-text notes and up to **4 photos**.
- **Three separate dates**, deliberately distinct: *opening date* (when the
  container starts accepting parcels), *closing date* (last drop-off), and
  *estimated departure date* (kept editable while the listing is open, frozen
  once closed — the explicit "mark as departed" action takes over).
- **Pricing**: amount + currency (USD, EUR, CFA, GBP, CNY) + unit
  (per kg, per lb, per CBM, or flat).
- **Pickup policy** stated up front on every listing: drop-off only, free
  pickup, or pickup for a fee (with its own amount and currency).
- **Extra stops**: up to 3 additional pickup or drop-off / grouping points
  beyond the main origin and destination, each with city, country and notes.
- **Listing status**: open → closing soon → full → closed. Only *open* and
  *closing soon* listings appear in browse by default and accept new messages.
- **Feature a listing** — self-serve 14-day boost that sorts it to the top of
  browse and profile pages.
- Edit and delete with per-photo removal; owner-only authorization on every
  mutating route.
- Each listing links out to a third-party container tracking lookup
  (track-trace.com) built from the container number.

### Search and discovery
- Browse with filters on origin country/city, destination country/city,
  container size and status; countries come from a built-in 160-entry list.
- **Nearby fallback** — when a city-specific search returns fewer than 6
  results, a second, broader country-level query runs and its results are
  shown separately as suggestions rather than returning an empty page.
- **"Use my location"** — browser geolocation passes lat/lng, and listings are
  sorted closest-first with a "N km away" badge. Origin coordinates are
  geocoded once at listing create/edit time via OpenStreetMap Nominatim and
  cached on the row; failures degrade silently and never block a save.
- Featured listings sort first, then newest.

### Messaging and reputation
- One conversation per (listing, sender) pair, created on first message;
  threaded inbox for both sides with last-message preview.
- Messaging is blocked on listings that are full or closed.
- **Ratings**: the sender in a conversation can rate the listing owner 1–5
  with an optional comment, once per conversation and editable afterwards.
  The average and count are cached on the user row and shown on listings,
  listing detail and the public profile.

### Package intake and tracking
- Listing owners (and their active staff) log each parcel against a container:
  sender name/contact/email, receiver name, weight, description, amount
  charged + currency, payment note, and up to 2 photos.
- **Package status**: received → packed & closed → departed → delivered.
  Statuses move in bulk with the listing: closing a listing marks every
  received parcel as packed, reopening reverses it, and "mark as departed"
  (allowed only on a closed listing) departs everything not already delivered.
- **Guest tracking page** at `/track/:token` — a random 20-byte token, no login
  required. It shows the route, container and current status.
- **QR code** for each parcel, rendered on its detail page and encoding the
  tracking URL, so any phone's native camera opens it — no in-app scanner.
- The tracking link is emailed to the sender automatically when an email
  address was recorded.
- **Receiver confirmation**: the recipient confirms pickup on the tracking
  page, optionally leaving notes; that marks the parcel delivered and notifies
  the container owner.

### Teams and staff
- Any listing owner can create a team (auto-created on first invite) with
  seat limits per plan: solo 1, team 3, team-plus uncapped.
- **Two invitation paths**: by account public ID, or by email address — the
  email path works even when the invitee has no account yet, carrying an
  unguessable token; the invitation is stored before the mail is sent, and the
  link is logged and shown to the owner if delivery fails.
- Signing up through an invitation link finishes the invitation automatically,
  and only if the new account uses the invited address.
- Invitations are always pending until accepted — never an instant add — and
  can be accepted, declined, revoked or removed.
- **Privilege split**: staff can log and manage packages on the owner's
  listings, but cannot edit, close or delete the listings themselves.
  Staff-managed listings are flagged as such on their dashboard.

### Notifications
- In-app notification centre with unread badge in the sidebar and top bar,
  mark-one-read-on-open and mark-all-read.
- Triggers: new message, new rating, team invitation, bulk package status
  change, and parcel delivered.
- Notifications store an i18n key plus variables rather than rendered text, so
  each one displays in the *recipient's* current language.

### Dashboards
- Every user lands on one dashboard showing their listings, recent
  conversations, and their own shipments (matched case-insensitively on the
  email the shipping agent recorded, since senders are often unregistered).
- **Business accounts** additionally get analytics: active vs closed listings,
  total packages and a breakdown by status, total inquiries, per-listing
  inquiry and package counts, and revenue totalled per currency.
- **Individual accounts** get shipment-side stats instead: total shipments,
  in transit, delivered, and conversation count.

### Public profile ("ShipBox")
- `/u/:handle` — a shareable storefront listing all of a user's open
  containers, with their rating, meant to be posted to social media or a
  messaging status.
- Open Graph / share-card metadata on listing and profile pages, with a
  generated fallback image; a native share-sheet button with clipboard
  fallback.

### Admin panel (`/admin`)
- Gated by an `is_admin` flag with no self-serve path to it — the first admin
  is created out-of-band with `scripts/make-admin.js`.
- **Dashboard**: total users, signups over 7 and 30 days, containers by
  status, packages by status, teams, conversations, ratings, unread
  notifications.
- **Users**: paginated search across name, email, public ID and handle,
  filterable by account type; per-user detail showing listings, package
  counts, recent packages, owned team and staff memberships; grant/revoke
  admin, with a guard against revoking your own last access.
- **Listings**: paginated search across container number, route and owner;
  force-close or delete any listing. These routes are deliberately separate
  from the owner-scoped ones so per-owner checks never have to be weakened.
- **Packages**: read-only cross-owner search for support and dispute lookups.
- **Teams**: every team with its members.

### Internationalisation
- Five languages — **French (default), English, Spanish, German, Swahili**.
- Language switcher in the top bar; switching while logged in also saves the
  preference.
- Resolution order: `?lang=` → saved user preference → cookie → French, with a
  fr → en fallback chain per key.
- A missing key never renders as a raw dotted path — it is humanised into a
  rough label and logged once.
- `npm run i18n:check` compares key sets across catalogs.

### Legal and guidance
- Terms of Service, Privacy Policy and a Getting Started guide, all
  translated, linked from the footer and referenced in the signup consent line.

---

## 3. Security posture

- bcrypt password hashing (cost 10) and a **dummy-hash comparison** on unknown
  emails so login timing does not leak which addresses have accounts.
- Rate limiting on login and signup (20 requests / 15 min / IP), with
  `trust proxy` set so the real client IP is used behind the platform proxy.
- **CSRF**: session cookie is `SameSite=Lax`, `httpOnly`, and `secure` in
  production, layered with an Origin/Referer host check on every unsafe method.
- **Upload hardening**: MIME allow-list (jpeg/png/webp/gif), 5 MB cap, per-form
  file-count caps, and the stored extension derived from the MIME type rather
  than the client filename — so a `.svg` cannot be smuggled through and served
  back as executable content.
- Helmet security headers (CSP is off because several views rely on inline
  handlers; CORP is relaxed so link-preview crawlers can fetch share images).
- Open-redirect protection on post-login `returnTo` targets.
- Numeric-ID route guards, ownership checks on every mutating handler, and
  parameterised SQL everywhere (the two dynamic query builders pass values as
  positional parameters).
- The simple query parser is used instead of `qs`, which has open advisories.

---

## 4. Branding, PWA and mobile packaging

- A full brand system documented in `BRAND.md`: an orange **S** routed through
  a navy shipping container, SVG masters in `public/images/brand/`, and
  `npm run brand:assets` rendering every PNG size, the multi-resolution
  favicon, the OG share card, and the native iOS/Android icon and splash sets.
- Installable PWA: `manifest.json` with maskable icons, theme colour, and a
  native-style bottom tab bar plus safe-area handling in the layout.
- App-store packaging is prepped but not submitted — Capacitor iOS and Android
  projects are committed, with splash-screen and status-bar plugins configured.
  `MOBILE.md` documents what still needs real values (production URL, bundle
  ID) and the store prerequisites.

---

## 5. Operations

| Command | What it does |
| --- | --- |
| `npm start` | Frees the port if a stale instance holds it, then boots and migrates |
| `npm run migrate` | Runs pending SQL migrations |
| `npm run i18n:check` | Reports key drift between locale catalogs |
| `npm run brand:assets` | Regenerates all icon/splash/share art from the SVG masters |
| `npm run mobile:sync` | Pushes config and web assets into the native projects |
| `node scripts/make-admin.js <email>` | Bootstraps the first platform admin |
| `node scripts/seed-sample-data.js` | Creates tagged demo accounts and listings |
| `node scripts/remove-sample-data.js` | Deletes everything the seed script created |

Configuration (`.env`): `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `NODE_ENV`,
and optional `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` /
`SMTP_PASS` / `SMTP_FROM`.

Restart failures are explicit: if the port is still held, the process exits
with a clear message rather than letting an old instance keep serving stale
code.

---

## 6. What is deliberately not built yet

- **No payments or escrow.** A parcel's amount charged and payment note are
  recorded for the groupeur's own bookkeeping; money changes hands off-platform.
- **No email provider configured.** Mail falls back to console logging, so
  parcel tracking links and team invitations work end to end today and start
  delivering the moment SMTP credentials are added, with no code change.
- **No password reset flow.**
- **Team plans are not billed.** Seat limits are enforced in code; `team_plus`
  is uncapped pending a real billing decision.
- **No automated test suite.**
- **No Content-Security-Policy**, pending removal of the inline handlers in the
  views.
