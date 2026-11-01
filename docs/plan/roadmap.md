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

## Side projects

Work outside the app, in its own folder and spec, recorded as `lab-NN` sprints.

| Sprint | Goal | Record |
|---|---|---|
| lab-01 | Battery Lab: what grid charging would add to a solar battery | [sprints/lab-01-battery-lab.md](sprints/lab-01-battery-lab.md) |
| lab-02 | Existing and new installation, the day in words | [sprints/lab-02-two-views.md](sprints/lab-02-two-views.md) |
| lab-03 | Days you can compare, a score, and a simpler page | [sprints/lab-03-day-score.md](sprints/lab-03-day-score.md) |
| lab-04 | What kind of day it was, and less on screen | [sprints/lab-04-day-type.md](sprints/lab-04-day-type.md) |
| lab-05 | Step through weeks and months | [sprints/lab-05-period-stepping.md](sprints/lab-05-period-stepping.md) |
| lab-06 | Fold the parts of a day | [sprints/lab-06-day-folds.md](sprints/lab-06-day-folds.md) |

## Not scheduled

PO-07 (15-minute prices), PO-08 (weekly patterns), PO-10 (hourly outlook),
PO-11 (cost tracking). Each is worth a decision record before it is scheduled.
