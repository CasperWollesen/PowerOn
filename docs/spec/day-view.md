# Today and Tomorrow (`DAY`)

### DAY-01 · Tabs
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The app MUST have four tabs: History, Today, Tomorrow, Outlook.

- Subtitles: number of stored days, weekday and date, `~13:00` while tomorrow is
  unpublished, number of outlook days.
- Today is selected on start. If the day window is already over and tomorrow is
  published, the app opens Tomorrow instead, once per session.

### DAY-02 · Section order
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The day view MUST be ordered by what the user came for:

1. Your appliances
2. Best time (with the day's range)
3. Now (today only)
4. Prices per hour (Full and Nerd)
5. Nerd cards (Nerd only)
6. Coming days

### DAY-03 · Now card
**Status:** Implemented · **Priority:** Must · **Verify:** test

Today MUST show the current hour's price prominently.

- Price, band badge and a hint such as "Fair until 17:00 · cheap from 22:00".
- Two factor pills: how the price compares with the cheapest and the most
  expensive of the remaining hours ("Cheapest", "0,4× priciest").
- Full and Nerd also name the cheapest and priciest hour and their prices.

### DAY-04 · Best time
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The app MUST recommend the cheapest 3 consecutive actionable hours.

- Headline: "Best time today: 16–19", with a factor when the most expensive
  3 hours cost at least 5 % more.
- If tomorrow's best window of the same length is at least 20 % cheaper, a line
  says so.
- With fewer than 3 hours left, the longest possible window is used.

### DAY-05 · Period strip
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The day window MUST be shown as blocks coloured by price band and sized by their
number of hours, labelled with the range and average when they are wide enough.
Past blocks are dimmed.

### DAY-06 · Cheapest windows
**Status:** Implemented · **Priority:** Should · **Verify:** manual

Full and Nerd MUST show the cheapest 1, 2, 3 and 4 hour windows with their times
and average price.

### DAY-07 · Hourly chart
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Full and Nerd MUST show all 24 hours as bars on a fixed Y axis.

- The axis always runs 0 to the configured maximum (default 10 kr./kWh) and never
  rescales per day.
- Bars above the maximum are clipped and marked, not rescaled.
- Colours follow the price band; hours outside the window are grey, past hours
  dimmed, the current hour outlined and the cheapest window marked.
- Gridlines sit at the band thresholds, named in Nerd.
- Tapping a bar shows hour, price, spot price (full mode) and band.
- Nerd overlays the share that is tariffs, tax and VAT.

### DAY-08 · Lowest and highest of the day
**Status:** Implemented · **Priority:** Must · **Verify:** test

Every day view MUST lead with the day's range, not just the average.

- Three tiles: Lowest (price, hour and band), Highest (price, hour, band and how
  many times the lowest it is), Average.
- Shown for both Today and Tomorrow, in all view modes.
- Based on the whole day window, including hours that have passed.

### DAY-09 · States
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The day view MUST handle loading, not published, error with retry, and
"the day window is over for today".

### DAY-10 · Nerd cards
**Status:** Implemented · **Priority:** Could · **Verify:** manual

Nerd MUST add, for the selected day:

- Price breakdown for the current hour and the window average, with the source of
  the tariffs.
- Statistics: average, median, standard deviation, min, max, max ÷ min, 24 h
  average, 24 h spot average, hours with negative spot price.
- A table of all hours: spot, add-ons, total, level and factor against the
  cheapest hour.
