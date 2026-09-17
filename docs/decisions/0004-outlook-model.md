# 0004 · Ridge regression on weather for the outlook

**Status:** Accepted · 2026-09-17

## Context

Prices are published two days ahead at most, but the user plans laundry days
further out and asked whether the weather can tell which coming days are cheap,
and whether any are near free.

Danish prices are largely wind driven, and the price area is coupled to Germany.
The app has no backend, so the model must train in the browser on data it can
fetch itself.

## Decision

A ridge regression per day, trained on the device on up to 90 recent days, with
features: 14-day spot level, wind capacity factor in Denmark and North Germany,
solar radiation in Denmark and Germany, temperature and weekend/holiday. Targets
are the window average, cheapest 3 hours, lowest hour and highest hour in spot terms.

Backtest on a year of DK1 data (Sep 2025 – Sep 2026, walk-forward, observed
weather), against a 14-day average baseline:

| Target | Correlation | MAE | Baseline MAE |
|---|---|---|---|
| Window average | 0,80 | 0,13 | 0,22 |
| Cheapest 3 hours | 0,82 | 0,14 | 0,23 |
| Lowest hour | 0,81 | 0,14 | 0,22 |
| Highest hour | 0,57 | 0,30 | 0,34 |

Classifying days as cheap, normal or expensive was right 67 % of the time, and a
genuinely cheap day was predicted as expensive once in 80 days.

Feature ablation showed German wind and the weekend flag matter most; dropping
Danish wind alone changes little because the two are correlated.

## Consequences

- The outlook is useful for choosing a day, not an hour. It is always labelled an
  estimate and carries a widening range.
- Predictions are clamped to the range seen in training, because a linear model
  extrapolates below prices that never occur.
- The highest hour is visibly less certain than the lowest; both are shown, and
  the Nerd view states the validation error.
- Training data is limited by Open-Meteo's 92 past days (about 70 usable), so
  accuracy improves as the device accumulates weather history.
- Alternatives not taken: a hosted model (needs a backend), gradient boosting (no
  library, hard to justify on 70 rows), and an hourly shape model (not needed for
  day-level planning).
