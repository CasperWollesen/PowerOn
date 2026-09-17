# 0008 · Absolute price bands instead of relative levels

**Status:** Accepted · 2026-09-17 · Supersedes the relative levels introduced in sprint 02

## Context

Until now an hour was coloured cheap, normal or expensive *relative to that day*:
thirds of the spread between the day's cheapest and most expensive hour. That
answers "when today?" but not "is this price actually good?". On an expensive day
the cheapest hour still looked green, and on a flat cheap day nothing did.

The owner asked for configurable absolute ranges instead, proposing five named
steps, and noted they would fit the current price and the history ("a day went
from Free to Expensive").

Two colour systems on one screen would be worse than either, so the choice was
which one owns the colours.

## Decision

Five absolute bands own every colour and badge in the app: **Near free, Cheap,
Fair, Expensive, Extreme**, decided by four thresholds the user can edit, stored
separately per price mode.

The relative dimension stays, but as words and structure rather than colour: the
best-time recommendation, the cheapest 1–4 hour windows, the factor pills
("2,4× cheapest"), and the best window outlined in the chart.

Naming: the owner proposed Free / Cheap / Fair / Expensive / High. "Near free" is
used instead of "Free" because the full price includes about 0,25 kr./kWh of
tariffs and VAT, so it is never actually free, and "Extreme" instead of "High"
because it has to read as clearly above "Expensive".

Defaults come from a year of DK1 prices rather than intuition. The owner's
proposal (0,2 / 1 / 2,5 / 5) was measured against the full price and would have
put 71 % of hours in one band and almost never reached the lowest, because those
numbers are spot-price thinking.

| Band | Full price | Spot | Share of hours (full) |
|---|---|---|---|
| Near free | < 0,50 | < 0,15 | 12 % |
| Cheap | < 1,20 | < 0,60 | 25 % |
| Fair | < 2,00 | < 1,10 | 46 % |
| Expensive | < 3,50 | < 1,80 | 16 % |
| Extreme | ≥ 3,50 | ≥ 1,80 | 1 % |

Five bands is the resolution: three would repeat what the relative levels said,
and more than five is noise on a phone.

## Consequences

- One vocabulary: "Fair" means the same on every tab, every day.
- A day can be summarised as a band range, which is how History and Outlook rows
  now read.
- On a day where every hour shares a band the colours no longer show *when* to
  act, so the chart marks the cheapest window and the appliance rows always state
  now, best and worst.
- Thresholds are per price mode; switching mode switches the set, because the two
  scales are about 0,25 kr./kWh apart.
- The chart draws the bands as faint background stripes, which also gives the
  fixed Y axis a meaning it did not have before.
