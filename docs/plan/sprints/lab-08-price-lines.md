# Sprint lab-08 · Cheapest buy and best sale in the price chart

**Date:** 2026-11-01 · **Status:** Done

## Goal

The dashed lines in the price chart show what a battery can work with on the day:
the cheapest buy and the best sale, the band between them, and whether buying to
sell later pays. They replace the day's averages from lab-07.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Dashed lines at the cheapest buy and the best sale, a faint band between | `LAB-10` | S |
| – | Hours, difference and the sale needed to pay, in words | `LAB-10`, `LAB-11` | S |
| – | Price summary: best sale minus cheapest buy | `LAB-10` | S |

## Spec changes

- Changed: `LAB-10` (the dashed lines and the price summary).

## Verification

- [x] `python dev/run-tests.py` — 120/120 tests
- [x] `python dev/spec-check.py` — 120 requirements, 0 problems
- [x] Local, week 19–25/10: 22/10 pays (cheapest buy 1,07 at 12:00, best sale 1,99
      at 19:00, needs 1,35, +0,64 a kWh); 21/10 does not (needs 2,04, best sale
      1,84); on 19/10 and 23/10 the best sale comes before the cheapest buy and the
      text says so; two dashed lines and the band between them on every day; no
      console errors
- [ ] No readable screenshot: the preview pane was too small; lines and band were
      checked through the page instead
- [ ] Live site checked after deploy
