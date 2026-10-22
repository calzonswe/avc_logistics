# ADR 0003: Production target — self-hosted, HTTP internally, all user traffic via external TLS reverse proxy

**Date**: 2026-10-21
**Status**: Accepted

## Decision

The app is self-hosted on company-owned hardware. Containers speak plain HTTP; a reverse proxy maintained **outside this repo** terminates TLS, and *all* user traffic — including LAN users — goes through it via the HTTPS hostname (e.g. `https://avc.example.com`). Backups, monitoring, and certificate handling are also operated externally; this repository ships none of them.

## Considered Options

- Direct `http://<host>:<port>` access by some or all users — **rejected**: service worker, PWA install/offline asset cache, background sync, and web-push are all secure-context-gated browsers and refuse to run over plain HTTP. They are in-scope features (ADR 0004), so HTTP-only access would silently disable them.
- App terminates TLS itself — **rejected**: duplicates the external proxy infrastructure that already exists.

## Consequences

- Every user device must use the proxy's HTTPS hostname; there is no supported way to use the app via a raw HTTP URL, not even locally (localhost excepted where applicable).
- No backup/monitoring/cert work may be planned into the app; it is outside the repository's scope by decision.
