# Usage History (`USE`)

### USE-01 · Private consumption connection
**Status:** Implemented · **Priority:** Must · **Verify:** test

An optional Cloudflare Worker MUST fetch one configured consumption metering point
from Eloverblik. The public app MUST never contain Eloverblik credentials.

- Refresh token, metering point ID and a random private app key are Worker secrets.
- Every data request requires the app key; CORS alone is not authentication.
- HTTPS only, exact allowed origin, bounded dates (1–92 completed Danish days),
  fixed upstream endpoints, no arbitrary proxying, no upstream error disclosure.
- The browser keeps the app key and consumption in memory only. Disconnect clears
  both and invalidates pending requests. Responses are private and no-store.
- Empty, missing, estimated, malformed and failed upstream data remain distinct.
- Failures expose only fixed diagnostic codes and allowlisted numeric Eloverblik
  error codes: token exchange, meter access, date range, upstream HTTP/network,
  and unsupported/malformed data must be distinguishable. Network failures add a
  fixed cause (`timeout`, `fetch` or `other`), never the error message. Never relay upstream
  error text, stack traces or response bodies. Legacy Workers get an explicit
  HTTP-status fallback and an instruction to update for diagnostics.

### USE-02 · Consumption by price band
**Status:** Implemented · **Priority:** Must · **Verify:** test

Usage History MUST show reported total kWh, kWh/cost/share in all five configured
bands, and unpriced kWh separately. Percentages use all reported consumption.

- Reuse `priceHours()` and `bandEdges()` / `bandFor()`, including price mode,
  supplier surcharge and grid settings. Use all 24 hours, regardless of day window.
- Join UTC intervals, preserving repeated autumn hours and missing spring hours.
  Split consumption proportionally when its interval spans multiple price intervals;
  this assumes uniform use within a meter interval and is labelled an estimate.
- Missing prices never become zero-price consumption. Negative prices are valid.
- Invalid, overlapping or duplicate intervals are rejected, never double counted.
- Report time coverage, estimated meter readings and tariff uncertainty. Costs are
  energy-cost estimates, not invoices; subscription fees are excluded.

### USE-03 · Base consumption estimate
**Status:** Implemented · **Priority:** Should · **Verify:** test

With at least seven complete days of measured intervals, show a cautious base-load
estimate: the duration-weighted 10th percentile of measured kW, and its energy over
the observed period, capped at each interval's consumption. Explain that appliances,
heating and solar can affect it; it is not measured standby or guaranteed savings.
Hide the estimate for incomplete coverage or estimated readings.

### USE-04 · Usage History tab
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Add Usage History without changing existing tabs. Offer 7/30/90 completed days and
a custom inclusive period, defaulting to 30 days ending yesterday. Show setup,
loading, retryable error, empty and partial states. Preserve edited form values
across background renders. Recalculate loaded readings when price settings change.

Use the existing band colours, names, Danish number formatting and responsive cards.
Lead with the combined Expensive/Extreme kWh, share and cost; prominently mark a
share of at least 20% as significant. Always show both bands separately too.
Simple mode retains all requested totals and band cards; Nerd adds coverage detail.

### USE-05 · Daily breakdown
**Status:** Implemented · **Priority:** Should · **Verify:** test

After the base consumption estimate, list every Danish day of the loaded period,
newest first, with that day's reported kWh and cost. Under each day show only the
bands in which electricity was actually used, each with its kWh and cost. Days
follow Danish midnight, so they can hold 23 or 25 hours. Days without readings are
labelled as such; unpriced kWh is shown separately and never priced at zero. The
same price settings, bands and estimate caveats as USE-02 apply.
