# Sprint lab-06 · Fold the parts of a day

**Date:** 2026-11-01 · **Status:** Done

## Goal

A day in the existing-installation view reads as a score, a headline and three
one-line summaries; each part opens on request and stays as it was while stepping
from day to day.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | "What kind of day" with the weather and the timing/grid split in its summary | `LAB-17`, `LAB-19` | S |
| – | "The day in words" with what each way nets in its summary | `LAB-17` | S |
| – | "Why smart software earns more" with the extra kWh and wear in its summary | `LAB-17` | S |
| – | Open or closed remembered per part | `LAB-17` | S |

## Spec changes

- Changed: `LAB-17` (the day's folded parts), `LAB-19` (where the description sits).

## Verification

- [x] `python dev/run-tests.py` — 118/118 tests (no new test: the folds are layout)
- [x] `python dev/spec-check.py` — 120 requirements, 0 problems
- [x] Local, 26/10: the three summaries read "Partly sunny · very windy · better
      timing +4,26 kr. · buying from the grid +13,09 kr.", "Today (manual) nets
      +15,49 kr. · Smart software +32,84 kr. · incl. wear" and "31,6 kWh more bought
      · 24,9 kWh more sold · 1,0 kWh more to the house · 2,59 kr. more wear"; two
      parts closed stay closed when stepping to 30/10 and after a reload
- [ ] No screenshot: the preview pane did not draw while the app was in the
      background; layout checked through computed styles instead
- [x] Live site checked after deploy: 26/10 shows the same three summaries as
      locally; a closed "why" part stays closed on 27/10; no console errors
- [ ] Not checked on a real phone
