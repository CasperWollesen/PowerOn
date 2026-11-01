# Sprint lab-03 · Days you can compare, a score, and a simpler page

**Date:** 2026-11-01 · **Status:** Done

## Goal

The owner can see what smart software would have earned each day, split into
better timing and buying from the grid, find the days worth a look by a score, and
is no longer misled by short periods scaled up to a year.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | "Today (manual)" as a daily rule a person can follow | `LAB-06` | S |
| – | Day-by-day comparison with the same battery level at every midnight | `LAB-07` | M |
| – | No per-year scaling below 300 days; average per day instead | `LAB-09` | S |
| – | Day score 0–100, best days, previous/next 50+ | `LAB-18` | M |
| – | Collapsible Setup; extra charts one level down | `LAB-10`, `LAB-13` | S |
| – | Retry stromligning.dk on HTTP 429 and show fetch errors | `LAB-02` | S |

## Spec changes

- New: `LAB-18` (day score and the days worth a look).
- Changed: `LAB-06` (today is a fixed daily rule), `LAB-07` (day by day against
  today), `LAB-09` (sum of the days, no scaling of short periods), `LAB-10`, `LAB-13`
  (Setup folds), `LAB-17` (both start and end at the same level).

## Verification

- [x] `python dev/run-tests.py` — 114/114 tests, 60 requirements covered
- [x] `python dev/spec-check.py` — 118 requirements, 0 problems
- [x] Walked through locally: 12 months and 7 days, a DST day, previous/next 50+,
      week and month, Setup folding, 375 px; a headless 1280 px screenshot
- [x] Found on the way: stromligning.dk answers 429 when many months are fetched at
      once; the page now retries and says so instead of silently using spot prices
- [ ] Live site checked after deploy

## Result

Default (partly assumed) household, 1/11/2025–31/10/2026: smart software earns
2 263 kr. more than today's rule over the year – 1 201 kr. from better timing of the
same moves and 1 062 kr. from buying from the grid. 48 of 365 days score 50 or more
(12,50 kr. or more to win). With the 2028 tax the grid part drops to about 300 kr.,
the timing part stays.

## Notes

- Why the old 7-day figure looked so high: +78 kr. in 7 autumn days was scaled to
  4 049 kr. a year. Short periods are no longer scaled.
- Why a day could look negative: smart control had bought power that was still in
  the battery at midnight. Days now start and end at the same level.
- The day-by-day comparison ignores energy carried across midnight, so it is a little
  lower than planning continuously (shown one level down as a second estimate).
