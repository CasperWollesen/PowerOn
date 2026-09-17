# Sprint 04 · Lowest and highest, and a spec to work from

**Date:** 2026-09-17 · **Status:** Done

## Goal

Make the day's range the headline number everywhere, and give the project a
written specification that implementations can be held up against.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Lowest and highest price per day in Today, Tomorrow, History and Outlook | `DAY-08`, `HIST-02`, `HIST-03`, `OUT-06`, `OUT-07`, `OUT-08` | M |
| – | Predict the lowest and highest hour, not just averages | `OUT-01`, `OUT-03` | S |
| – | Specification with requirement IDs | all | L |
| – | Browser test harness and headless runner | `docs/verification.md` | M |
| – | spec-check with traceability and consistency checks | – | M |
| – | Sprint process, roadmap and backlog | – | S |

## Spec changes

The whole spec is new: 87 requirements across 11 files, plus decision records
0001–0007, architecture, data sources and verification.

New behaviour in this sprint: `DAY-08` (lowest/highest/average tiles),
`HIST-02` and `HIST-03` (range rows and range bars), `OUT-06` (low–high in the
outlook rows), and the lowest/highest targets in `OUT-01`.

## Verification

- [x] `python dev/run-tests.py` — 55 tests, 35 requirements covered
- [x] `python dev/spec-check.py` — 87 requirements, 82 tagged, 0 problems
- [x] Manual: Today, Tomorrow, History, Outlook in Simple, Full and Nerd, light and dark, 375 px
- [x] Service worker cache version bumped
- [x] Live site checked after deploy

## Result

- Every day view leads with lowest and highest, with the average as a secondary
  number, on today, tomorrow, the coming days and every stored day.
- The outlook model predicts the lowest and highest hour too, backtested at
  correlation 0,81 and 0,57 respectively.
- `docs/` now holds the specification, architecture, data sources, decisions,
  verification guide and this plan. `AGENTS.md` is the entry point for assistants.
- Traceability is generated, not maintained by hand, and CI runs tests plus
  spec-check on every push.

## Notes

- Writing the spec found a real bug: `25:00` was accepted as a day-window time
  because the pattern only checked the shape. Fixed and covered by a test.
- Separate models for lowest, average and highest can disagree; the order is now
  enforced after prediction.
- `NFR-09` (accessibility) is the only requirement marked Partial. It is on the
  backlog as PO-06.
- Next: sprint 05, outlook accuracy tracking and export/import.
