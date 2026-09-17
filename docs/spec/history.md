# History (`HIST`)

### HIST-01 · Stored days
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The History tab MUST list the past days stored on the device, newest first.

- 14 days are shown, with a button to load 30 more at a time.
- The tab subtitle and the card header show how many days are stored.
- While the backfill is still running, the tab says so with progress.

### HIST-02 · Day row
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Each day MUST lead with its lowest and highest hour in the day window.

- Row: weekday and date, then `low–high` in kr./kWh.
- Below: the band range of the day ("Cheap → Expensive"), the hours of the low and
  high, the average with its band, and (not in Simple) the cheapest 3 hours and
  the weather.

### HIST-03 · Range chart
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The tab MUST show the last 30 days (90 in Nerd) as range bars.

- Each bar runs from the day's lowest to its highest hour, with a tick at the
  average, coloured by the band of that average.
- The scale is fixed at half the configured chart maximum so periods stay comparable;
  bars above it are marked.
- The header states the lowest and highest price of the whole period.
- Below the bars, two strips show wind and sun per day (not in Simple).

### HIST-04 · Day detail
**Status:** Implemented · **Priority:** Should · **Verify:** manual

Opening a day MUST show its hourly chart on the same fixed axis as Today, plus the
cheapest 3 hours and how many times the highest hour is the lowest. Nerd adds the
wind and sun figures for Denmark and Germany.

### HIST-05 · Honest about old tariffs
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Because tariffs are only stored for recent days, the tab MUST state that older days
use the nearest stored tariffs and are therefore approximate. It must also say that
clearing site data removes the history.
