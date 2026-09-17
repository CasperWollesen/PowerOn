# 0003 · Tariffs from stromligning.dk, full price by default

**Status:** Accepted · 2026-09-17

## Context

The app first showed spot prices only, and the user compared them with
elpriser.dk, which showed a much higher number. Two reasons: elpriser.dk shows the
current 15-minute price, and it includes tariffs, electricity tax and VAT. The
spot price is roughly half of what a household actually pays, and the grid
company's tariff is time-of-use, peaking 17–21, which changes *when* to use power,
not just what it costs.

Tariffs are published by Energinet's Datahub, which is CORS-blocked like the rest
of Energi Data Service. `stromligning.dk` exposes the same numbers per grid
company with open CORS.

## Decision

Fetch tariffs from `stromligning.dk` per grid company and day, average the
15-minute values per hour, and show the full price by default:

```
(spot + system + net + electricity tax + grid tariff + supplier surcharge) × 1.25
```

Spot-only remains available as a setting. The user picks their grid company; until
then only national tariffs are included, and a banner says so.

## Consequences

- The displayed price matches the household's bill; verified against
  stromligning.dk's own total (0,997 kr./kWh, DK1, 17 September 2026, N1 C).
- A second third-party dependency. If it disappears, the national defaults still
  give a reasonable price, and only `tariffs.js` needs changing.
- Cheap and expensive hours now reflect the grid tariff's evening peak, which is
  what the user actually pays.
- Tariffs are cached for 45 days, so older history uses the nearest known profile
  and is approximate. This is stated in the History tab.
