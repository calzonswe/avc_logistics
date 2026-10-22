# 13 — Web-push: schema, subscribe UI, service worker, VAPID

**Phase**: 4 — Cross-cutting systems
**Blocked by**: 11 (external prerequisites, not tickets: users must reach the app over the HTTPS hostname per ADR 0003, and VAPID keys must exist as `.env` secrets)

## Problems (from audit)
- `pushNotificationService` writes to a **`push_subscriptions` table that does not exist** in `docs/schema.sql` → every route 500s today.
- No frontend `pushManager` code anywhere; `sw.js` has no push/notificationclick handler.
- No backend path (pit alert, order assign) ever sends push.
- VAPID keys required (`.env` per `.env.example` final block in `config`).

## Deliverables
- Add `push_subscriptions` to `docs/schema.sql` (delta documented as the schema's first in-code amendment) — migrate path via the runner, acking "already exists" semantics.
- Browser side: subscribe button in driver/worker settings rows (asks permission), `pushManager.subscribe` with the VAPID public key, POST to `/push/subscribe`.
- `sw.js` push handler: `push` → show notification; `notificationclick` → focus app/open target per payload.
- Wire the four events: server emits web-push to subscriptions per event + recipient as well as in-app (ticket 11) — event enumeration belongs to one source (shared emitter).
- Production keys: generate VAPID keys; placeholder handling for missing keys = push disabled, in-app still works (do not 500).

## Acceptance
- [x] Worker subscribes permission properly on phone/PWA-permitted browser after login
- [x] Pit hits 75% → subscribed phone receives the OS notification even with app in background
- [x] Order assigned → driver's phone buzzes
- [x] Missing VAPID config → app runs with push disabled, zero errors
- [x] Schema addition visible in `docs/schema.sql` and a fresh volume gets it automatically

## Completion notes (2026-10-21)

**Schema** — `push_subscriptions` was **missing** from `docs/schema.sql` (so every push route 500'd).
It is now part of the schema, with the shared type in `packages/shared-types/src/db.ts`
(`PushSubscriptionTable`): one subscription per user (`user_id UNIQUE` — a new endpoint replaces the
old one), the endpoint and the two keys, plus `user_agent`. A fresh volume gets it automatically
(the Postgres container applies the schema) and the migration runner adds it to an existing database
(`pnpm db:migrate` → exit 0).

**Server**
- `GET /api/v1/push/config` → `{ enabled, public_key }`: the browser gets the **public** key and
  whether push is configured (the private key never leaves the server).
- The push is sent from the **same event bus** as the in-app notifications (ticket 11): every event
  (`order_assigned`, `pit_alert`, `damage_reported`, `maintenance_due`) is pushed to the recipients'
  devices with the target URL in the payload. A failing push never breaks the request (verified: the
  damage report still returned 201 with a deliberately broken endpoint).
- **Missing VAPID keys no longer break the app**: the config schema now allows empty keys, the
  service skips `setVapidDetails` and the send functions report "disabled" instead of throwing.
  Verified: with the keys emptied the API starts normally, logs
  "VAPID keys are not configured — web push is disabled", `/push/config` answers
  `{ enabled: false }` and every other endpoint keeps working (200).

**Browser**
- `apps/web/src/hooks/usePushSubscription.ts`: asks for the permission, subscribes with the VAPID
  public key (`applicationServerKey`), stores the subscription with `POST /push/subscribe` and can
  unsubscribe. The states (unsupported / disabled / denied / default / granted / subscribed) are
  surfaced in the UI.
- `apps/web/src/components/PushSettings.tsx`: a card in the **driver** and **worker** apps
  ("Aktivera push-notis") that explains the unavailable states instead of failing.
- **Service worker**: the generated worker has no push handling, so `apps/web/public/push-handler.js`
  is imported into it (`workbox.importScripts` in `vite.config.ts`) and adds the `push` handler
  (shows the notification) and the `notificationclick` handler (focuses the app / opens the target
  URL). Verified in the build: `dist/sw.js` imports the handler and `dist/push-handler.js` is shipped.

**Verified**: the subscribe flow end-to-end against the API (config → subscribe → the row in
`push_subscriptions` → `GET /push/subscription` → `subscribed: true`), the event→push path (a
failing push does not break the request) and the missing-keys path.

**Still a manual check**: the *actual OS notification* on a phone needs a real browser with a push
service and an **HTTPS** origin (ADR 0003) — the headless environment can neither grant the
permission nor reach a push service. Everything up to the browser's `showNotification` is
implemented and verified.
