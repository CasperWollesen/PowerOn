# Data (`DATA`)

How prices and weather enter the app, how they are cached and refreshed.
Endpoint details live in [../data-sources.md](../data-sources.md).

### DATA-01 · Spot prices
**Status:** Implemented · **Priority:** Must · **Verify:** test

Hourly day-ahead spot prices for the selected price area MUST come from
elprisenligenu.dk, one JSON file per day, in kr./kWh excl. VAT.

- URL shape: `https://www.elprisenligenu.dk/api/v1/prices/YYYY/MM-DD_<AREA>.json`.
- Hours are normalised to `{ hour, price }` in Danish local time and sorted.
- The app requests today and tomorrow on startup.

### DATA-02 · Tomorrow is not always published
**Status:** Implemented · **Priority:** Must · **Verify:** manual

A missing day (HTTP 404) MUST be treated as "not published yet", not as an error.

- The Tomorrow tab shows a waiting state saying prices usually arrive around 13:00.
- The tab subtitle shows `~13:00` until the day is available.

### DATA-03 · Retry tomorrow
**Status:** Implemented · **Priority:** Should · **Verify:** review

While tomorrow's prices are missing, the app MUST retry regularly from midday.

- From 12:00 Danish time, retry every 15 minutes while the app is open.
- Also retry when the app becomes visible again.

### DATA-04 · Day cache
**Status:** Implemented · **Priority:** Must · **Verify:** review

Fetched days MUST be cached on the device and reused without refetching.

- A cached day with at least 23 hours is served from cache.
- Cache key per area and date; stored compactly (hour/price pairs only).

### DATA-05 · Offline fallback
**Status:** Implemented · **Priority:** Must · **Verify:** manual

When the network fails but a cached day exists, the app MUST show the cached data
and say so.

- The day is marked stale and the footer reads "Offline – showing last saved prices".
- A missing day with no cache shows an error state with a retry button.

### DATA-06 · History backfill
**Status:** Implemented · **Priority:** Should · **Verify:** review

In the background the app MUST fill in missing days so History and the outlook
model have data.

- The last 100 days before today are fetched if missing, at most 4 requests at a time.
- Failures are skipped silently and retried on the next run.
- Progress is visible in the History and Outlook tabs while it runs.

### DATA-07 · Retention
**Status:** Implemented · **Priority:** Should · **Verify:** review

Old data MUST be pruned so storage stays bounded.

- Spot days older than 400 days are deleted; legacy cache keys are removed.
- Tariff days older than 45 days are deleted.
- Weather keeps at most 400 days of daily features.

### DATA-08 · Weather
**Status:** Implemented · **Priority:** Must · **Verify:** test

Weather MUST come from Open-Meteo and be reduced to daily features per date.

- Two requests: hourly 100 m wind for 4 Danish and 4 North German points, and
  daily solar radiation sum plus mean temperature for 3 points.
- 92 past days and 8 forecast days per request.
- Features per day: wind capacity factor DK and DE (0–1), solar DK and DE
  (kWh/m²), mean temperature DK (°C).
- Wind capacity factor: 0 below 3 m/s and from 25 m/s, otherwise
  `(v³ − 27) / (1728 − 27)` capped at 1.
- Cached for 3 hours; a failed refresh keeps using the cached values.

### DATA-09 · Danish time
**Status:** Implemented · **Priority:** Must · **Verify:** test

All dates and hours MUST be Danish wall-clock time regardless of the device's
time zone.

- "Today" is the Danish date, also when travelling.
- Date arithmetic is calendar-based, so daylight-saving days do not shift dates.
- Days with 23 or 25 hours are handled without crashing.

### DATA-10 · Day rollover
**Status:** Implemented · **Priority:** Should · **Verify:** review

At Danish midnight the app MUST move on to the new day by itself.

- Prices reload, the selected tab returns to Today, the outlook is rebuilt.
- A minute timer keeps the current hour and the "now" price fresh.

### DATA-11 · Network isolation
**Status:** Implemented · **Priority:** Must · **Verify:** review

Only `js/api.js`, `js/tariffs.js` and `js/weather.js` may perform network requests,
so a source can be replaced in one place.
