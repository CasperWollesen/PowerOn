# Sprint lab-09 · When buying or selling pays, not 1:1

**Date:** 2026-11-01 · **Status:** Done

## Goal

The price chart marks only the hours where grid trading pays, with limits that
count the battery's losses, wear and margin – a kWh bought is not a kWh sold. This
replaces the lines at the raw cheapest buy and best sale from lab-08.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | "Buy below" and "sell above" limits after losses, wear and margin | `LAB-10`, `LAB-11` | S |
| – | Shade only the hours that clear them, in the right order of the day | `LAB-10` | S |
| – | Price summary: what buying to sell later earns at best | `LAB-10` | S |

## Spec changes

- Changed: `LAB-10` (the dashed lines, the shaded hours and the price summary).

## Verification

- [x] `python dev/run-tests.py` — 121/121 tests
- [x] `python dev/spec-check.py` — 120 requirements, 0 problems
- [x] Local, 22/10: buy below 1,66 kr. (best sale 1,99 at 19:00) shades 00–07 and
      10–16; sell above 1,35 kr. (cheapest buy 1,07 at 12:00) shades 17–24; +0,64 a
      kWh. 21/10: buy below 1,52, sell above 2,04, nothing shaded, does not pay.
      24/10: shades 00–06 and 18–20, +0,08. Screenshot checked; no console errors
- [ ] Live site checked after deploy
