# Sprint lab-07 · Step across periods, folded charts, average prices

**Date:** 2026-11-01 · **Status:** Done

## Goal

Days can be stepped through without stopping at the edge of the chosen period; the
price and battery charts fold like the rest of the day; the price chart can show the
day's average buy and sell price; the setup inputs line up.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Previous / next in the explorer move the period at its edge | `LAB-10`, `LAB-20` | S |
| – | Prices and battery level in folded parts with summaries | `LAB-10`, `LAB-17` | S |
| – | Checkbox: dashed average buy and sell lines, spread in words | `LAB-10` | S |
| – | Setup inputs line up when a label wraps | `LAB-13` | S |

## Spec changes

- Changed: `LAB-10` (stepping across the period edge, folded charts, average lines),
  `LAB-13` (inputs line up).

## Verification

- [x] `python dev/run-tests.py` — 120/120 tests
- [x] `python dev/spec-check.py` — 120 requirements, 0 problems
- [x] Local: week 19–25/10, day 19/10, ‹ ("Previous week: 12/10–18/10") opens 18/10
      in week 12–18/10, › brings 19/10 back; the price part reads "Buy 1,91–3,30 ·
      sell 1,17–2,06 · on average 0,85 kr. apart"; the checkbox draws two dashed
      lines (2,37 and 1,52) and is remembered; all 14 rows of setup inputs line up;
      the only console error is the local server's missing /favicon.ico
- [ ] Live site checked after deploy
