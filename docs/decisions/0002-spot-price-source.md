# 0002 · elprisenligenu.dk as the spot price source

**Status:** Accepted · 2026-09-10

## Context

The obvious source is Energinet's Energi Data Service, the official Danish TSO
API. A feasibility test from the browser showed it blocked: it answers with an
empty 200 and no `Access-Control-Allow-Origin` header for every origin except its
own domains, for both `DayAheadPrices` and the legacy `Elspotprices`. With no
backend, that source is unusable.

Open-Meteo, on the other hand, allows any origin.

## Decision

Use `elprisenligenu.dk` for hourly spot prices: `ACCESS-CONTROL-ALLOW-ORIGIN: *`,
one small JSON file per day and area, hourly values already in kr./kWh, history
back to 2022.

Energinet stays documented as the fallback if a proxy is ever acceptable.

## Consequences

- No backend is needed, which keeps [0001](0001-plain-web-no-build.md) intact.
- We depend on a third party that is not the TSO. Its numbers were checked against
  Energinet's own 15-minute prices and match exactly as hourly averages.
- Only hourly resolution, although the market moved to 15 minutes in October 2025.
  Good enough for planning a wash; revisit if the difference starts to matter.
- A 404 means "not published yet", which the app must treat as a normal state.
