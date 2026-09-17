# Analysis (`ANA`)

Pure calculations over a day of prices. No network, no DOM, no storage.

### ANA-01 · Day window
**Status:** Implemented · **Priority:** Must · **Verify:** test

The day window MUST be whole hours derived from the user's start and end time.

- Start rounds down, end rounds up and is exclusive: 06:00–22:00 → hours 6…21.
- 00:00 as the end means 24.
- An end at or before the start means the whole day.

### ANA-02 · Hours carry their price band
**Status:** Implemented · **Priority:** Must · **Verify:** test

Every hour MUST be put in its absolute price band (see [bands.md](bands.md)) and
marked as inside or outside the day window.

- The band comes from the thresholds for the active price mode, so the same price
  always reads the same way.
- Hours outside the window get a band too, but are drawn as outside.
- The relative "cheap for today" grading this replaced lives on as the best-time
  recommendation, the cheapest windows (`ANA-04`) and the factors (`ANA-06`).

### ANA-03 · Actionable hours
**Status:** Implemented · **Priority:** Must · **Verify:** test

Recommendations MUST only use hours the user can still act on: inside the day
window, and for today from the current hour onwards.

### ANA-04 · Cheapest and most expensive windows
**Status:** Implemented · **Priority:** Must · **Verify:** test

The app MUST find the cheapest run of N consecutive hours, and the most expensive
run of the same length, among the actionable hours.

- Hours must be consecutive by hour number; gaps are not bridged.
- Lengths 1–4 are shown on the day view.

### ANA-05 · Periods
**Status:** Implemented · **Priority:** Should · **Verify:** test

Neighbouring hours in the same band MUST be merged into periods with their own
average, so the day reads as a few blocks instead of 16 bars. A per-band summary
(ordered from the cheapest band upwards) drives the appliance cost chips.

### ANA-06 · Factors
**Status:** Implemented · **Priority:** Must · **Verify:** test

Prices and costs MUST be comparable as factors, e.g. "2,4× cheapest".

- A factor is `value / reference`, shown with one decimal (none from 10×).
- No factor is shown when the reference is below 0,05 kr./kWh or the value is
  negative, because the ratio would be misleading.
- For appliance costs the threshold scales with the appliance's consumption.

### ANA-07 · Day range
**Status:** Implemented · **Priority:** Must · **Verify:** test

For any day the app MUST be able to state the lowest and the highest hour in the
day window, with their hours, plus the average.
