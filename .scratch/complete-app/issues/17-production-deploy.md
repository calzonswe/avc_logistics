# 17 — Production deploy: Dockerfiles, nginx, compose, prod env

**Phase**: 5 — Production hardening
**Blocked by**: 01–16 (every feature ticket); context: ADR 0003 (HTTP internally, HTTPS only via the external proxy)

## Problems (from audit)
- `apps/web/Dockerfile` production stage copies from a wrong path (`COPY --from=base /apps/web/dist` — missing `/app` prefix) → image won't build.
- `apps/web/nginx.conf` proxy_pass `http://api:3000/` **strips the `/api` prefix** → production API calls arrive as `/v1/...` and 404.
- No production compose file; dev compose exposes api/web dev servers directly.
- `JWT_SECRET` default placeholder in compose; Redis provisioned but used by no code (decide: keep for future sessions/cache or remove from prod compose).
- `docker-compose` postgres references migrations dir `packages/db/src/migrations` which doesn't exist.

## Deliverables
- Fix the web production build path; fix nginx config to forward `/api` prefix in place (`proxy_pass http://api:3000;` without trailing slash, or rewrite correctly) + `/uploads` + `/ws` upgrade headers.
- `docker-compose.prod.yml`: api (NODE_ENV=production, built), web (nginx serving build, proxying), postgres, redis; **no direct api/web port exposure** — only the HTTP entrypoint your external TLS proxy points at.
- Prod env template: strong `JWT_SECRET`, VAPID keys (ticket 13 uploads), CORS_ORIGIN + WEB_URL set as https://<your-reverse-proxy-hostname>, `LOG_PRETTY=false`, no debug defaults.
- Postgres: apply schema on empty volume; clean the compose reference to the nonexistent migrations dir.
- Healthcheck/`/ready` used for compose ordering; pino logging to stdout (proxy/aggregator-friendly per ADR).

## Acceptance
- [ ] `docker compose -f docker-compose.prod.yml build` succeeds
- [ ] Through the HTTPS proxy hostname: login via `/api/v1/auth/login`, all four views loaded, `/uploads` assets served, WS connects
- [ ] No api/web ports hidden exposed to the host that shouldn't be — single upstream entrypoint
- [ ] Existing dev workflow (`pnpm dev`) unaffected
