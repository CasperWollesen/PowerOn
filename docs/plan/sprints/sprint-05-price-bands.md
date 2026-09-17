# Sprint 05 · Price bands

**Date:** 2026-09-17 · **Status:** Done

## Goal

Give every price an absolute, named judgement the user sets themselves, so
"Fair" means the same thing on every tab and a day can be read as
"Near free → Fair".

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Five configurable price bands | `BAND-01`…`BAND-06`, `SET-09` | M |
| – | Bands replace the relative levels as the colour and badge vocabulary | `ANA-02`, `ANA-05`, `DAY-03`, `DAY-05`, `DAY-07`, `DAY-08` | M |
| – | Band range on history and outlook days | `HIST-02`, `HIST-03`, `OUT-04`, `OUT-06`, `OUT-08` | S |
| – | Band stripes behind the chart, best window marked | `DAY-07` | S |

## Spec changes

- New file [../../spec/bands.md](../../spec/bands.md) with `BAND-01`…`BAND-06`.
- New `SET-09` for the threshold editor; defaults added to `SET-03`.
- Rewritten: `ANA-02` (hours carry a band, not a relative level), `ANA-05`
  (periods merge by band), `OUT-04` (days judged by band, not by percentile).
- Adjusted wording in `DAY-03`, `DAY-05`, `DAY-07`, `DAY-08`, `APPL-07`,
  `HIST-02`, `HIST-03`, `OUT-06`, `OUT-08`, `VIEW-02`.
- Decision record [../../decisions/0008-price-bands.md](../../decisions/0008-price-bands.md).

## Verification

- [x] `python dev/run-tests.py` — 63 tests, 40 requirements covered
- [x] `python dev/spec-check.py` — 94 requirements, 0 problems
- [x] Manual: Today, Tomorrow, History, Outlook and Settings in all three view
      modes, dark and light, 375 px
- [x] Band editor: edits persist, descending values rejected, reset works
- [x] Service worker bumped to v6, `js/bands.js` added to the precache list

## Result

Five bands — Near free, Cheap, Fair, Expensive, Extreme — own every colour and
badge. Thresholds are editable per price mode, defaulting to values measured from
a year of DK1 prices. History and Outlook days read as a band range. The chart
paints the bands as faint stripes and marks the cheapest window, so the fixed
Y axis finally means something.

## Notes

- The owner's proposed thresholds were spot-price thinking; measured against the
  full price they would have put 71 % of hours in one band. Hence separate
  defaults per price mode.
- Two colour systems on one screen would have been worse than either, so the
  relative levels were removed rather than kept alongside. Their job is now done
  by words: best time, cheapest windows, factors, and the marked best window.
- Roadmap unchanged otherwise: sprint 06 is still outlook accuracy tracking
  (PO-02) and export/import (PO-01).
