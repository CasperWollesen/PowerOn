# Analysis (`ANA`)

Pure calculations over a day of prices. No network, no DOM, no storage.

### ANA-01 · Day window
**Status:** Implemented · **Priority:** Must · **Verify:** test

The day window MUST be whole hours derived from the user's start and end time.

- Start rounds down, end rounds up and is exclusive: 06:00–22:00 → hours 6…21.
- 00:00 as the end means 24.
- An end at or before the start means the whole day.

### ANA-02 · Price levels
**Status:** Implemented · **Priority:** Must · **Verify:** test

Hours MUST be labelled cheap, normal or expensive relative to the same day's window.

- Thresholds are thirds of the spread between the cheapest and most expensive hour
  in the window.
- If the spread is below 0,40 kr./kWh the day counts as flat and every hour is normal.
- Hours outside the window get a level too but are marked as outside.

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

Neighbouring hours with the same level MUST be merged into periods with their own
average, so the day reads as a few bands instead of 16 bars.

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
