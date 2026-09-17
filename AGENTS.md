# Working on PowerOn

Instructions for anyone changing this repository, human or AI. Read this before
the first edit; it takes two minutes and prevents most mistakes.

PowerOn is a personal progressive web app that answers "when should I use power?"
for Danish electricity prices. Plain HTML, CSS and ES modules on GitHub Pages.
**No build step, no backend, no frameworks, no npm.**

## Ground rules

1. **The spec decides.** `docs/spec/` says what the app does. Change the spec in
   the same commit as the behaviour, never after.
2. **Tag your code.** Add `// @req PRICE-01` above the function that implements a
   requirement. `python dev/spec-check.py` fails if an ID does not exist.
3. **Keep the boundaries** in `docs/architecture.md`: network only in `api.js`,
   `tariffs.js`, `weather.js`; pure logic without DOM or storage; views return
   `{ html, mount() }`; only `app.js` decides when to render.
4. **English everywhere** in code, comments and UI. Numbers are formatted Danish
   (comma decimal) through `js/format.js`.
5. **Escape anything** that comes from data or the user with `esc()` before it
   goes into a template literal.
6. **New file in `js/`?** Add it to `APP_SHELL` in `service-worker.js` and bump
   `CACHE_VERSION`. Behaviour changed at all? Bump `CACHE_VERSION`.
7. **Relative paths only** (`./js/app.js`), because the site is served from a
   repository subpath.
8. **Bands own the colours.** Near free / Cheap / Fair / Expensive / Extreme from
   `js/bands.js` are the only colour and badge vocabulary. The relative "when
   today" signal is carried by words and structure: best time, cheapest windows,
   factor pills, the marked best window.
9. **Never invent price data.** Real prices for published days; anything else is
   labelled an estimate with its uncertainty.
10. **Do not add a dependency** without a decision record in `docs/decisions/`.

## The loop for a change

```
spec  →  code (+ @req tags)  →  tests  →  run tests + spec-check  →  manual check  →  commit
```

```bash
python dev/serve.py          # http://127.0.0.1:8123 , no HTTP caching
python dev/run-tests.py      # unit tests, headless Chrome
python dev/spec-check.py     # traceability + consistency, rewrites docs/spec/traceability.md
```

Add a test whenever the requirement's **Verify** field says `test`; the first
argument of `test()` is the requirement ID list.

## Layout

```
index.html  manifest.json  service-worker.js
css/styles.css
js/     app.js dashboard.js day-view.js outlook-view.js history-view.js settings-view.js
        api.js tariffs.js weather.js               ← the only network access
        prices.js forecast.js stats.js holidays.js appliances.js settings.js time.js format.js
        chart.js ui.js storage.js install.js
dev/    serve.py run-tests.py spec-check.py make-icons.py tests/ api-test.html
docs/   spec/ plan/ decisions/ architecture.md data-sources.md verification.md
```

## Things that will bite you

- **Energinet's API is CORS-blocked** from the browser. Do not "fix" the price
  source back to it; see `docs/decisions/0002-spot-price-source.md`.
- **Tomorrow's prices 404 until about 13:00.** That is a normal state, not an error.
- **stromligning.dk returns an empty list** for days without published prices, so
  tariffs fall back to the nearest cached profile.
- **Open-Meteo's `past_days` is capped at 92**, and 100 m wind is missing for the
  oldest ~20 of them.
- **Danish time, always.** Use `js/time.js`; never `new Date()` arithmetic for
  dates. Days can have 23 or 25 hours.
- **Prices can be negative.** Factors and ratios must not divide by something near
  zero; `ratio()` already guards this.
- **localStorage is shared** with the user's other GitHub Pages projects; keys are
  prefixed `poweron.` and reads and writes must never throw.
- **iOS Safari has no install prompt.** The banner explaining Share → Add to Home
  Screen is deliberate.
- **The user's browser caches modules.** Use `dev/serve.py`, which sends
  `Cache-Control: no-store`, or you will test yesterday's code.

## Commits

- One logical change per commit, spec and code together.
- Subject line in the imperative, under 72 characters, mentioning the requirement
  IDs when useful: `Add lowest and highest of the day (DAY-08, HIST-02, OUT-06)`.
- Push to `main`; GitHub Pages deploys automatically. Check the live site after.

## Conversation language

The repository is English. The owner writes in Danish; answer in the language they
use, but never mix languages inside the app or the code.
