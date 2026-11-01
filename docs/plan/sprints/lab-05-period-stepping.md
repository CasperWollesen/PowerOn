# Sprint lab-05 · Step through weeks and months

**Date:** 2026-11-01 · **Status:** Done

## Goal

The owner can pick this week or this month and step backwards and forwards through
weeks, months, years or any number of days with one click.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | Presets "This week" and "This month" | `LAB-20` | S |
| – | Previous / next by the period's own unit, capped at yesterday | `LAB-20` | S |

## Spec changes

- New: `LAB-20` (choosing and stepping the period).

## Verification

- [x] `python dev/run-tests.py` — 118/118 tests, 62 requirements covered
- [x] `python dev/spec-check.py` — 120 requirements, 0 problems
- [x] Local: this week → previous week twice → next; this month → previous month;
      last year → next year (becomes this year to yesterday); buttons name the step
      and disable at yesterday; no console errors
- [x] Live site checked after deploy: this week (+57 kr.) → previous week 19–25/10
      (169 hours, the DST week, +33 kr.); this month (+167 kr.) → previous month
      September (+282 kr.) → next month; the same numbers as locally, buttons wrap
      at a narrow width, no console errors
- [ ] Not checked on a real phone

## Result

"Last 12 months" steps by 12 months, "This week" by Monday–Sunday weeks, "This
month" by calendar months. The active preset is highlighted.

## Notes

- The local preview server had been stopped by the app during the session; the
  PowerOn service worker then served old cached files. Restarting the server fixed it.
