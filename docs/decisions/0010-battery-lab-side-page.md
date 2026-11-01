# 0010 · Battery Lab as a side page in this repository

**Status:** Accepted · 2026-11-01

## Context

A household with solar panels, a 60 kWh home battery and a 10 kW hybrid inverter
sells stored solar power in expensive hours. The open question is whether it would
also pay to charge the battery from the grid when power is cheap, and therefore
whether automatic control (the separate HomeEnergyPilot project, C# on a
Raspberry Pi) is worth finishing. Answering it needs a year of hourly prices,
solar and consumption, and a planner that is honest about what was knowable in
advance.

PowerOn already has the price sources, Danish time handling and number formatting,
and GitHub Pages hosting. Its product spec excludes automation and trading advice,
and its tabs are built for a phone glance, not for a year-long what-if.

## Decision

- Build the **Battery Lab** as its own page in `battery-lab/`, served next to the
  app on GitHub Pages. It is not a tab, not in the app shell, and does not change
  any app behaviour. PowerOn's product non-goals still hold for the app.
- Reuse PowerOn's pure modules (`time.js`, `format.js`, `storage.js`) by relative
  import. The lab has its own network module and its own pure model, optimiser,
  summary and import modules, specified in [`LAB`](../spec/battery-lab.md) and
  checked by the same `spec-check.py` and browser tests.
- **Prices from stromligning.dk** for both directions: `/api/prices` (spot,
  tariffs and the electricity tax that applied that day) and
  `/api/prices/production` (sell price after production tariffs), one month per
  request with hourly aggregation. elprisenligenu.dk would need 365 requests a
  year and has no tariffs.
- **Solar from Open-Meteo's historical forecast archive** (`global_tilted_irradiance`
  per panel plane), one request per array and period. No PV library.
- **Dynamic programming** over a battery-level grid as the optimiser, written in
  plain JavaScript. A linear-programming library was rejected (dependency, and
  buy/sell asymmetry, curtailment and efficiency are simpler in a DP). The same
  algorithm and its test cases are meant to be ported to C# for HomeEnergyPilot.
- Hourly resolution, matching PowerOn. 15-minute prices are a later step.
- Colours are the lab's own categorical palette for energy origins (solar, grid,
  battery); PowerOn's price bands are not used because the lab does not classify
  hours by price.
- Imported measurements stay in memory only, like Usage History (decision 0009).

## Consequences

- One deploy, one repository, one test run; the lab breaks if a shared module's
  signature changes, which the tests catch.
- The PowerOn service worker controls `battery-lab/` as well (same scope). It passes
  cross-origin API calls through untouched and caches the lab's files network-first,
  which is harmless; the lab is not precached.
- Defaults describe a real household, so they must stay free of names, addresses
  and exact coordinates.
- The lab's answer is an estimate: perfect knowledge of solar and consumption
  inside a planning window makes it optimistic, and the page says so.
