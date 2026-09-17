# Non-functional (`NFR`)

### NFR-01 · Plain web, no build
**Status:** Implemented · **Priority:** Must · **Verify:** check

Plain HTML, CSS and ES modules. No framework, no bundler, no transpiler, no
backend. The repository is deployable as-is on GitHub Pages, so every path is
relative and every file referenced from `index.html` exists.

### NFR-02 · Language and formatting
**Status:** Implemented · **Priority:** Must · **Verify:** test

Code, comments and user interface are in English. Numbers follow Danish
formatting (comma as decimal separator) and prices are kr./kWh or kr.

### NFR-03 · Mobile first
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The app MUST work on a 360 px wide phone and scale up to a 640 px column on
desktop, with touch targets of at least 44 px and no horizontal page scrolling.
Wide content such as tables scrolls inside its own container.

### NFR-04 · Light and dark
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Both themes MUST be fully styled through CSS variables, including charts, badges
and tables.

### NFR-05 · Storage and privacy
**Status:** Implemented · **Priority:** Must · **Verify:** review

All data stays on the device in `localStorage` behind a defensive wrapper that
never throws. No account, no analytics, no personal data in requests. Roughly
110 KB for 100 days of history.

### NFR-06 · Module boundaries
**Status:** Implemented · **Priority:** Must · **Verify:** review

- Network only in `api.js`, `tariffs.js`, `weather.js`.
- Pure logic (`prices.js`, `stats.js`, `forecast.js`, `holidays.js`, appliance and
  price calculations) without DOM or storage access, so it can be unit tested.
- Views return HTML strings plus a `mount()` that attaches events.
- `app.js` owns state and decides when to render.

### NFR-07 · Graceful degradation
**Status:** Implemented · **Priority:** Must · **Verify:** review

A failing source MUST never break the rest of the app: tariffs fall back to
defaults, weather falls back to cache, prices fall back to cached days, and each
card states what is missing.

### NFR-08 · Responsiveness
**Status:** Implemented · **Priority:** Should · **Verify:** manual

The first screen renders from cache without waiting for the network. Background
work (backfill, weather, model) never blocks interaction, and a background update
must not throw the user back to the top of the page.

### NFR-09 · Accessibility basics
**Status:** Partial · **Priority:** Should · **Verify:** manual

Icon buttons have labels, toggles are radio groups with `aria-checked`, colour is
never the only signal (levels always have text too), and reduced motion is
honoured. A full audit is still outstanding.
