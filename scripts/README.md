# UI verification scripts (headless Chromium over the DevTools protocol)

These drive a real browser against the running dev servers. They are how the four role views were
verified without a human clicking through them — a blank or crashed page is otherwise invisible to
the type checker and the API tests.

Prerequisites:

```bash
pnpm docker:up && pnpm db:migrate && pnpm db:seed
pnpm dev                      # API :3000 + web :5173
```

A signed token per role is needed (`/tmp/opencode/tokens.txt`, one `email token` per line). Tokens
expire after 15 minutes — regenerate them with `app.jwt.sign` (see
`apps/api/src/__tests__/transportOrderDetail.test.ts` for the shape).

| Script | What it does |
| --- | --- |
| `cdp-routes.mjs` | Renders every route of every role view, asserts the content area has real content and reports console errors. |
| `cdp-shots.mjs` | Takes screenshots of the routes listed in `/tmp/opencode/shots.json`. |
| `cdp-kiosk.mjs` | Renders the dashboard in kiosk mode at 1920×1080 and checks the layout has no chrome and no scrollbars. |
| `cdp-mobile.mjs` | Renders the dashboard at 390×844 (phone) and checks for horizontal overflow. |
| `cdp-offline-read.mjs` | The offline cold start: online session → reload with the network off (needs the production build on :4173). |
| `cdp-offline.mjs` | The offline write path: a change offline → the queue → the flush on reconnect. |
| `cdp-i18n.mjs` | The language switch: Swedish by default, English after the switch, persists across a reload. |

`sign-tokens.sh` writes fresh access tokens (15 min TTL) to `/tmp/opencode/tokens.txt` — the scripts
need them.
