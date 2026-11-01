# Sprint lab-02 · Existing and new installation, the day in words

**Date:** 2026-11-01 · **Status:** Done

## Goal

The owner of an installation sees only what smart software would add to how it is
run today, day by day in plain words; a household without solar or a battery
can see what a setup would cost, save and pay back.

## Items

| ID | Item | Requirements | Size |
|---|---|---|---|
| – | "Today (manual)": sell stored solar at the best hours, buy only when nearly free | `LAB-06`, `LAB-07` | S |
| – | Existing-installation view: today against smart software, 2028 tax beside it | `LAB-09`, `LAB-15` | M |
| – | The day in words, side by side, with why they differ | `LAB-10`, `LAB-17` | M |
| – | New-installation view: purchase prices, payback, both tax regimes | `LAB-15`, `LAB-16` | M |

## Spec changes

- New: `LAB-15` (two views), `LAB-16` (purchase prices and payback), `LAB-17` (the day in words).
- Changed: `LAB-06` (seven strategies incl. today and no installation), `LAB-07`
  (grid charging below a price), `LAB-09`, `LAB-10`, `LAB-13` (the battery is a
  self-built one from an electric car).

## Verification

- [x] `python dev/run-tests.py` — 110/110 tests, 59 requirements covered
- [x] `python dev/spec-check.py` — 117 requirements, 0 problems
- [x] Manual, local server: both views for 1/11/2025–31/10/2026; day, week and
      month; a day opened from the month table; 375 px without page scroll; no
      console errors
- [x] Fixed on the way: ISO week numbers were one too low in some years
- [x] Live site checked after deploy: both views show the same figures as locally,
      no console errors

## Result

Existing installation, default (partly assumed) household: smart software earns about
1 320 kr. a year more than today's manual way (sell stored solar at the best hours,
top up from the grid at or below 0,30 kr./kWh), about 450 kr. with the 2028 tax.
New installation with the assumed DIY prices (160 000 kr. for 15 kWp and 60 kWh):
about 9 years payback with smart software, 7 years with the 2028 tax; solar alone
about 8 years.

## Notes

- "Today" is modelled with perfect timing, so the extra from software is a cautious
  estimate. Real measurements will show the actual gap.
- A single day's difference can be negative: what is bought one day is sold the
  next. The page says so and points to weeks and months.
- Purchase prices are rough estimates without a reliable Danish source; replace them
  with quotes.
