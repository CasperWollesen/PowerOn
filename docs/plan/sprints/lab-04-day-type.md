# Sprint lab-04 · What kind of day it was, and less on screen

**Date:** 2026-11-01 · **Status:** Done

## Goal

Each day says at a glance whether it was sunny or windy, what power cost, and where
smart software won; the period summary and the best days fold away.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Wind at 100 m in the same Open-Meteo request | `LAB-03`, `LAB-19` | S |
| – | Day type: sun against nearby days, wind, price extremes | `LAB-19` | S |
| – | "Where smart software wins": buys, sells, stores or covers more, and when | `LAB-19` | S |
| – | Weather column in the best days and week/month tables; 50+ days counted by weather | `LAB-19` | S |
| – | Result summary and best days in remembered expanders | `LAB-09`, `LAB-18` | S |

## Spec changes

- New: `LAB-19` (what kind of day it was).
- Changed: `LAB-03` (wind), `LAB-09` (summary folds), `LAB-18` (best days fold).

## Verification

- [x] `python dev/run-tests.py` — 116/116 tests, 61 requirements covered
- [x] `python dev/spec-check.py` — 119 requirements, 0 problems
- [x] Local check of four days (sunny 7/4, best day 8/9, cloudy and windy 15/1, the
      DST day 25/10); folds open and close and are remembered; no console errors
- [ ] A fresh browser could not load prices during the check: stromligning.dk kept
      answering 429 after a day of test runs. The retry logic waits and reports it.
- [ ] Live site checked after deploy

## Result

Of the 48 days scoring 50 or more, 24 were sunny and 22 windy (8 both). Example:
on sunny 7 April smart software sells 21,7 kWh in the night and early morning to
make room, then stores 38,2 kWh more solar that today's rule has to sell for about
0,01 kr./kWh.

## Notes

- Sun is judged against the best day within ±15 days, so a clear winter day is still
  "sunny".
- Wind is local (Horsens, 100 m); it stands in for the wind that sets DK1 prices.
