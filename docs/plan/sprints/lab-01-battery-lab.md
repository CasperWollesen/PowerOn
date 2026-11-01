# Sprint lab-01 · Battery Lab

**Date:** 2026-11-01 · **Status:** Done

## Goal

A household with solar and a 60 kWh battery can replay a past period on real prices
and see, day by day, what smart selling and charging from the grid would have earned.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Side page, data from stromligning.dk and Open-Meteo | `LAB-01`, `LAB-02`, `LAB-03` | M |
| – | Consumption model: house, heat pump, two cars | `LAB-04` | S |
| – | Five strategies, dynamic-programming optimiser, day-ahead planner | `LAB-05`…`LAB-08` | L |
| – | Summary, day/week/month explorer, break-even rules | `LAB-09`…`LAB-11` | M |
| – | CSV import and actual-versus-strategy comparison | `LAB-12` | M |
| – | Settings behind expanders, dark first, 375 px | `LAB-13`, `LAB-14` | S |

## Spec changes

- New file [../../spec/battery-lab.md](../../spec/battery-lab.md) with `LAB-01`…`LAB-14`.
- Decision record [../../decisions/0010-battery-lab-side-page.md](../../decisions/0010-battery-lab-side-page.md).
- `dev/spec-check.py` scans `battery-lab/` for `@req` tags.

## Verification

- [x] `python dev/run-tests.py` — 105/105 tests, 57 requirements covered
- [x] `python dev/spec-check.py` — 114 requirements, 0 problems
- [x] Manual, local server: a year (1/11/2025–31/10/2026) loads and calculates;
      day, week and month views; tooltips; dark and light; 375 px without page scroll
- [x] CSV import with a synthetic Solar.web-style file (Wh, Danish dates, SoC)
- [ ] Import of a real Fronius Solar.web or Eloverblik export
- [x] Service worker unchanged: the app's behaviour is unchanged, so no cache bump
- [ ] Live site checked after deploy

## Result

With the default (partly assumed) household and prices as charged, Nov 2025–Oct 2026:
smart selling of stored solar is worth about 5 000 kr. a year more than plain
self-use, and charging from the grid adds about 1 400 kr. a year on top
(wear 0,10 and margin 0,05 kr./kWh). With the 2028 electricity tax the grid part
drops to about 450 kr. The day-ahead planner reaches about 98 % of the hindsight
saving for the grid strategy (9 421 against 9 649 kr. versus no battery).

## Notes

- The optimiser is meant to be ported to C# for HomeEnergyPilot; the test cases in
  `dev/tests/battery-lab.test.js` are written so they can be carried over.
- Open questions for the owner of the battery: solar size and orientation, house and
  car consumption, supplier markup and sell fee, real charge power from the grid,
  battery price and cycle life, and whether the battery is one 60 kWh unit behind
  one 10 kW inverter.
