# ADR 0004: Scope upgrade — complete production application now; explicit exclusions recorded

**Date**: 2026-10-21
**Status**: Accepted

## Decision

This session promoted the documented MVP to a **complete production application**. The following previously partial/absent areas are now in scope and must ship working: full offline sync per ADR 0002 (all driver/worker writes through the Dexie queue and batch sync endpoint), web-push on top of in-app notifications, a minimal WebSocket dispatch layer, kiosk mode for the dashboard view, and Swedish (primary) + English i18n.

**Explicitly out of scope**: IoT sensor fill levels, ERP/webhook integrations, advanced route optimization (the fill-threshold suggester stays as-is), and native mobile apps (the PWA covers the mobile story). Enrichment continues after completion, one feature at a time.

## Consequences

- GLOSSARY.md's "Future Considerations (Not in MVP)" no longer applies as a backlog boundary; the exclusions above are the boundary (see also ADR 0003 for what is operated externally rather than absent).
- The four notification events agreed for push/in-app are: order assigned/re-assigned to a driver, pit reaching 75% fill, damage report created, maintenance task overdue.
