# Backlog

Ordered roughly by value. `S` is a small change, `M` a sitting, `L` more than one.
Items become requirements in `docs/spec/` when they are picked up.

## Next

| ID | Item | What the user gets | Touches | Size |
|---|---|---|---|---|
| PO-01 | Export and import of settings and appliances | A way to move to a new phone and a backup before clearing site data | `SET`, `APPL` | S |
| PO-02 | Track outlook accuracy | The app stores each day's estimate and later compares it with the real price, so History can show "estimated 0,9 · actual 1,1" and the Nerd view a running error | `OUT`, `HIST` | M |
| PO-03 | Seasonal tariff history | Older history days use the tariffs that actually applied (winter peaks are much higher), instead of the nearest stored profile | `PRICE-04`, `HIST-05` | M |
| PO-04 | Grid company suggestion | Suggest the grid company from a postcode so the first-run price is right without hunting on a bill | `PRICE-05` | M |
| PO-05 | "Start now?" answer per appliance | One line per appliance: start now, or wait until HH and save X kr. | `APPL-07`, `APPL-08` | S |
| PO-06 | Accessibility pass | Screen reader labels, focus order, contrast check; closes `NFR-09` | `NFR-09` | M |

## Later

| ID | Item | What the user gets | Touches | Size |
|---|---|---|---|---|
| PO-07 | 15-minute prices | Match what elpriser.dk shows and price short appliance runs more accurately | `DATA-01`, `ANA`, `DAY-07` | L |
| PO-08 | Weekly pattern view | "Mornings are usually expensive, weekends cheap" from the stored history | `HIST` | M |
| PO-09 | Appliance presets | Pick a typical washing machine or dryer instead of typing kWh | `APPL` | S |
| PO-10 | Hourly shape in the outlook | Estimated cheapest hours of a coming day, not just the day level | `OUT` | L |
| PO-11 | Cost tracking | Enter meter readings or a monthly consumption and see what it cost | new area | L |
| PO-12 | DK2 verification | Confirm every DK2 path with real data and a grid company from Zealand | `SET-05` | S |
| PO-13 | Screenshot tests | Headless screenshots of each tab in both themes, compared between commits | tooling | M |

## Ideas, not committed

- Notifications when a very cheap period starts (needs a backend for push, or a
  local scheduled notification that browsers barely support).
- Solar production input for households with panels.
- Sharing a day's chart as an image.
- A second price area shown side by side (DK1 vs DK2).
