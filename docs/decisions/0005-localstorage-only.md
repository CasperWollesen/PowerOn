# 0005 · localStorage as the only store

**Status:** Partially superseded by [0009](0009-private-usage-worker.md) for personal usage only; accepted for public price features · 2026-09-10

## Context

The app needs settings, appliances, cached prices, tariffs and weather, and has no
backend and no login. Options were `localStorage`, IndexedDB or a server.

## Decision

`localStorage` behind a defensive wrapper that swallows every error, with compact
records: one key per price day storing hour/price pairs only. 100 days of history
take about 110 KB, well inside the usual 5 MB per origin. The app asks for
persistent storage so the browser does not evict it.

## Consequences

- Everything is synchronous, which keeps rendering simple: a view can read a
  cached day while it draws.
- Data is per device and per browser. Clearing site data loses the history; the
  app says so, and history can be refetched from the APIs anyway.
- The origin is shared with other GitHub Pages projects of the same user, so keys
  are prefixed `poweron.` and the budget is respected.
- If the app ever needs more (per-hour history for years), IndexedDB becomes the
  next step.
