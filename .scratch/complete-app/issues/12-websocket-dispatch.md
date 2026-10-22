# 12 — Minimal WebSocket dispatch layer with polling fallback

**Phase**: 4 — Cross-cutting systems
**Blocked by**: 11 (same event bus should feed WS)

## Problems (from audit)
- `@fastify/websocket` is registered, `/ws` is proxied in vite + nginx — but **no ws route or handler exists**; nothing is ever broadcast.

## Deliverables
- WS endpoint at `/ws`: authorize on upgrade (reuse JWT auth), per-connection role/user registry.
- Broadcast bus: emit the same four events as ticket 11 onto connected clients (scoped: driver sees own orders, pit alerts scoped by site, manager/admin see manager events).
- Client hook subscribing to `/ws`; on message, feeds the notification drawer **and** invalidates relevant React Query caches (orders, pits).
- Graceful fallback: if WS fails, the 30s polling keeps app functional (verify nothing breaks offline-then-reconnect).

## Acceptance
- [x] Assign an order in manager view → connected driver's screen updates within ~1s without reload
- [x] Pit hits 75% → dashboard + supervisor devices show the alert promptly
- [x] Disable API network → app continues on polling; reconnect resumes WS cleanly
- [x] Unauthenticated WS upgrade rejected

## Completion notes (2026-10-21)

**Server — `apps/api/src/routes/websocket.ts`**
- `GET /ws?token=<jwt>` (outside the `/api/v1` prefix, outside the protected scope — the web dev
  server proxies `/ws` straight to the API). A browser cannot send an `Authorization` header on a
  handshake, so the route authorizes the **upgrade** with the token from the query string: a missing
  or invalid token is rejected with **401** (the upgrade never completes); a valid one is verified
  against the user row (must exist and be active).
- The connection is registered with the user's id/role/site. Every app event from the ticket 11 bus
  is pushed to the connections that may see it: the addressed users, the site's workers, and all
  managers/admins.
- `startWebSocketBroadcast()` connects the event bus to the sockets — the WS layer is a **listener**,
  not a second event source.

**Client — `apps/web/src/hooks/useAppEvents.ts`**
- Opens the socket while the user is signed in, shows a **toast** for every event and invalidates the
  React Query caches the event affects (orders / driver shift / pits / dashboard / maintenance /
  damage reports).
- **Polling fallback**: if the socket cannot connect, the hook retries with an exponential backoff
  (1 s → 30 s) and the app keeps working on its 30 s refetch intervals — nothing breaks offline.
- The `ToastProvider` was **never mounted** in the web app (so `useToast()` threw); it is now mounted
  in `main.tsx`, which also makes the toast container real.

**Verified**
- API level (script): an unauthenticated upgrade is rejected (401); a driver's socket receives
  `order_assigned`; a worker's socket receives the site's `pit_alert`; the manager's socket receives
  everything.
- Browser level (headless Chromium): with the driver's app open, assigning an order as a manager made
  the driver's screen show the toast ("Order TO-… tilldelad dig") and the new order in the list
  **without a reload** (~1 s), no console errors.

**Two integration details worth remembering**
- `@fastify/websocket` v8 hands the handler a `SocketStream`; the real socket (with `send`/`close`)
  is on `stream.socket`.
- The route must be registered **outside** the protected scope — otherwise the scope's
  `fastify.authenticate` hook rejects the handshake (401) before the route can read the token.
