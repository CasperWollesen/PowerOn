# Roadmap

Sprints in order. Each is one sitting unless noted. Items come from
[backlog.md](backlog.md); requirements live in [../spec/](../spec/).

## Done

| Sprint | Goal | Record |
|---|---|---|
| 01 | Prove the APIs work from the browser | see [../data-sources.md](../data-sources.md) |
| 02 | Dashboard, chart, appliances, settings, PWA | commit `6a4dd7c` |
| 03 | Full price with tariffs, view modes, factors, outlook, history | commit `c5905a9` |
| 04 | Lowest and highest price everywhere; spec, tests and plan | [sprints/sprint-04-spec-baseline.md](sprints/sprint-04-spec-baseline.md) |
| 05 | Configurable price bands as the app's one vocabulary | [sprints/sprint-05-price-bands.md](sprints/sprint-05-price-bands.md) |

## Next up

### Sprint 06 · Trust the numbers
Make the app's own accuracy visible and its data portable.
Items: PO-02 (track outlook accuracy), PO-01 (export/import).
Why now: the outlook makes claims about the future; showing how it did builds
confidence, and export protects the history that feeds it.

### Sprint 07 · Right price, everywhere
Items: PO-03 (seasonal tariff history), PO-12 (DK2 verification).
Why now: history in full-price mode is currently approximate for older days, and
DK2 has never been exercised with real data.

### Sprint 08 · Faster decisions
Items: PO-05 ("start now or wait"), PO-09 (appliance presets), PO-04 (grid company
from postcode).
Why now: these shorten the path from opening the app to acting on it.

### Sprint 09 · Quality pass
Items: PO-06 (accessibility), PO-13 (screenshot tests).
Why now: after three feature sprints, consolidate before adding more.

## Not scheduled

PO-07 (15-minute prices), PO-08 (weekly patterns), PO-10 (hourly outlook),
PO-11 (cost tracking). Each is worth a decision record before it is scheduled.
