# Outlook (`OUT`)

Estimated prices for the days after the published ones. Everything here is an
estimate and MUST be presented as such.

### OUT-01 · Model
**Status:** Implemented · **Priority:** Should · **Verify:** test

The outlook MUST be a ridge regression trained on the device from recent days.

- Features: 14-day spot level, wind capacity factor DK, wind capacity factor
  North Germany, solar DK, solar Germany, temperature DK, weekend/holiday.
- Targets, all in spot terms: window average, cheapest 3 hours, lowest hour,
  highest hour, 24 h average.
- Up to 90 recent days with both prices and weather; at least 30 days are needed,
  otherwise the tab says so.
- Training uses the price level as it was known 3 days before each day, so the
  model does not learn from information a real forecast would not have.

### OUT-02 · Accuracy is measured, not claimed
**Status:** Implemented · **Priority:** Should · **Verify:** test

The model MUST validate itself walk-forward on the most recent days (up to 21),
fitting only on earlier days, and report mean absolute error per target in the
Nerd view.

Reference from a year of DK1 data with observed weather (see
[../decisions/0004-outlook-model.md](../decisions/0004-outlook-model.md)):
window average corr 0,80 / MAE 0,13 · lowest hour corr 0,81 / MAE 0,14 ·
highest hour corr 0,57 / MAE 0,30 kr./kWh.

### OUT-03 · Predictions stay plausible
**Status:** Implemented · **Priority:** Must · **Verify:** test

Estimates MUST stay inside what has actually happened and be internally consistent.

- Values are clamped to the range seen in training (upper bound 1,25× the highest).
- Ordering holds: lowest ≤ cheapest 3 h ≤ average ≤ highest.
- The uncertainty band widens by 12 % per day ahead.
- Horizon: from the day after the last published prices up to 7 days after today.

### OUT-04 · Levels and near-free days
**Status:** Implemented · **Priority:** Should · **Verify:** test

Each day MUST be labelled against the last 60 known days.

- Very cheap ≤ 10th percentile, cheap ≤ 33rd, expensive ≥ 67th, otherwise normal.
- A day whose cheapest 3 hours are estimated at or below 0,05 kr./kWh spot is
  tagged as likely near-zero.

### OUT-05 · From spot to what the user pays
**Status:** Implemented · **Priority:** Must · **Verify:** test

Spot estimates MUST be converted with the tariff profile of that date.

- Averages use the average add-on over the window, the cheapest 3 hours use the
  cheapest 3 consecutive add-on hours, the lowest and highest hour use the lowest
  and highest add-on hour.
- In spot mode nothing is added.

### OUT-06 · Next days list
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The Outlook tab MUST list the coming days, leading with lowest–highest price.

- Known days (today, tomorrow) show their actual range, hours, average, factor
  against the 30-day average and cheapest 3 hours, and link to their tab.
- Estimated days show `~low–high`, level badge, average with factor, cheapest
  3 hours, near-zero tag, driver tags and the weather behind it.
- Nerd adds the likely range for the average.

### OUT-07 · Best coming day
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The tab MUST name the best day for a flexible load: the lowest estimated cheapest
3 hours among tomorrow and the estimated days, with its range and average.

### OUT-08 · Coming days strip
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The day view MUST show up to 6 coming days as small pills with weekday, estimated
lowest and highest price and an icon (⚡ for near-zero, otherwise the main driver),
opening the Outlook tab when tapped. While data is still loading the card says what
it is doing.

### OUT-09 · Drivers in plain words
**Status:** Implemented · **Priority:** Could · **Verify:** test

Days MUST carry short explanations: very windy (≥ 50 %), windy (≥ 30 %), calm
(< 12 %), sunny (≥ 4 kWh/m²), grey (≤ 1,2), weekend.

### OUT-10 · Model card
**Status:** Implemented · **Priority:** Could · **Verify:** manual

Nerd MUST show training period and size, the 14-day spot level, R², validation
errors per target, the feature weights and the inputs behind each day.

### OUT-11 · Danish holidays
**Status:** Implemented · **Priority:** Should · **Verify:** test

Public holidays MUST count as off days like weekends: New Year, Maundy Thursday,
Good Friday, Easter Sunday and Monday, Ascension, Whit Sunday and Monday,
Constitution Day, 24–26 and 31 December.
