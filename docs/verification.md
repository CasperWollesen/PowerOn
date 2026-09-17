# Verification

How we know the app does what the spec says.

## Automated

```bash
python dev/run-tests.py      # unit tests for the pure modules, headless Chrome
python dev/spec-check.py     # traceability + consistency checks
```

Both run in GitHub Actions on every push (`.github/workflows/verify.yml`).

**`run-tests.py`** serves the repository on a free port, loads `dev/tests/` in
headless Chrome and reads the harness's JSON summary. Set `CHROME` if the browser
is somewhere unusual. Add `--verbose` to list failures in detail.

**`spec-check.py`** reads the requirement IDs from `docs/spec/`, the `@req` tags in
the code and the IDs in the tests, writes `docs/spec/traceability.md` and fails on:

- an ID referenced in code or tests that does not exist in the spec,
- the same ID defined twice,
- an `Implemented` requirement with no code behind it,
- a `Verify: test` requirement with no test,
- a service worker precache list that no longer matches the files on disk,
- a manifest icon or a file referenced from `index.html` that is missing.

Use `--check` in CI mode: it fails instead of rewriting the traceability file.

## Manual checklist

Run the parts you touched. Phone width (360–390 px), light and dark, and once on
desktop.

**Today / Tomorrow**
- [ ] Lowest, highest and average tiles match the chart and the hour table.
- [ ] Band badges and colours agree with the thresholds in Settings, and the chart
      stripes line up with the bars.
- [ ] The cheapest window is still visible when every hour shares one band.
- [ ] The now card shows the current Danish hour and matches the chart bar.
- [ ] Best time, period strip and cheapest windows agree with each other.
- [ ] Appliance costs: pick one appliance and recompute by hand (kWh × price).
- [ ] Tomorrow before 13:00 shows the waiting state, not an error.

**Outlook**
- [ ] Known days match the Today and Tomorrow tabs.
- [ ] Estimated days are marked as estimates and ordered low ≤ avg ≤ high.
- [ ] Nerd shows training size and validation error.

**History**
- [ ] Bars run from the day's low to its high with the average tick between them.
- [ ] Opening a day shows its hourly chart on the same fixed axis.
- [ ] The note about approximate old tariffs is present.

**Settings**
- [ ] Changing grid company changes the price; check one hour against
      stromligning.dk for the same company and day.
- [ ] Changing the day window changes recommendations and the outlook.
- [ ] Spot mode shows lower numbers, says so in the footer, and switches to the
      spot band thresholds.
- [ ] Editing a band threshold changes badges and colours immediately; a value
      below the one above it is rejected without resetting the others.
- [ ] Appliance add, edit, remove and restore examples all work.

**PWA**
- [ ] Reload twice after a deploy picks up the new version.
- [ ] Airplane mode still shows the last loaded data.
- [ ] Install banner appears on iOS Safari and leads to a working home screen icon.

## Ground truth

- Full price: `https://stromligning.dk/api/Prices?priceArea=DK1&supplierId=<grid>&from=<date>T00:00:00&to=<date>T23:45:00`
  — the hourly average of `price.total` must match the app's hour.
- Spot price: `https://www.elprisenligenu.dk/api/v1/prices/<year>/<mm-dd>_<area>.json`.
- Remember that elpriser.dk shows the current **15-minute** price, not the hour.

## Release

1. Tests and spec-check pass.
2. `CACHE_VERSION` in `service-worker.js` bumped, new files added to `APP_SHELL`.
3. Push to `main`; GitHub Pages builds in a minute or two.
4. Open the live site, hard reload twice, check the footer and one price.
