# Architecture

PowerOn is a static site: `index.html` loads `js/app.js` as an ES module, and
public price features run in the browser without a build step. An optional
Cloudflare Worker protects personal Eloverblik usage data; see
[the setup guide](eloverblik-setup.md) and decision 0009.

## Layers

```
        ┌─────────────────────────────────────────────┐
shell   │ app.js        state, routing, timers        │
        └──────┬───────────────────────┬──────────────┘
               │ renders               │ loads
        ┌──────▼───────────┐    ┌──────▼──────────────┐
views   │ dashboard.js     │    │ api.js   (spot)     │ data
        │ day-view.js      │    │ tariffs.js (tariffs)│
        │ outlook-view.js  │    │ weather.js (weather)│
        │ history-view.js  │    └──────┬──────────────┘
        │ settings-view.js │           │ caches
        │ chart.js, ui.js  │    ┌──────▼──────────────┐
        └──────┬───────────┘    │ storage.js          │
               │ uses           └─────────────────────┘
        ┌──────▼──────────────────────────────────────┐
domain  │ prices.js  appliances.js  forecast.js       │
        │ stats.js   holidays.js    settings.js       │
        │ time.js    format.js                        │
        └─────────────────────────────────────────────┘
```

Rules (see `NFR-06`):

- **Data modules** are the only place that touches the network. Swapping a source
  means changing one file.
- **Domain modules** are pure functions: no DOM, no storage, no network. They are
  what the unit tests cover.
- **Views** return `{ html, mount(container) }` — a string plus event wiring —
  and never fetch anything themselves.
- **`app.js`** owns the state object and is the only place that decides when to
  render.

## Render flow

1. `applyRoute()` picks dashboard or settings from the hash.
2. `render()` builds the model (settings, window, days, appliances, forecast,
   insights) and hands it to `renderDashboard` or `renderSettings`.
3. `renderDashboard` draws the shell (top bar, tabs, banners, footer) and asks the
   selected tab's view for its HTML, then calls its `mount()`.
4. Views read prices through `priceHours(settings, date, spotHours)` so every tab
   applies the same price model.

## Loading sequence

```
start ──► applyRoute() ──► render (cached state, instant)
      └─► loadPrices()  ──► today + tomorrow spot ──► render
                        └─► loadTariffs()          ──► render
                        └─► computeForecast()      ──► render
      └─► loadInsights() ─► weather (3 h cache)
                        └─► backfill last 100 days (4 at a time, progress)
                        └─► computeForecast()      ──► render
```

Timers: a minute tick keeps "now" fresh, retries tomorrow's prices from 12:00,
and rolls over at midnight. `visibilitychange` refreshes what is stale.

## State

```js
{
  settings, appliances,
  view: 'dashboard' | 'settings',
  selectedTab: 'history' | 'today' | 'tomorrow' | 'outlook' | 'usage',
  now: { date, hour, minute },              // Danish wall clock
  days: { today: DayState, tomorrow: DayState },
  insights: { status, progress, message },  // background loading
  forecast,                                 // result of buildForecast()
}
```

`DayState` is `{ status: 'loading' | 'ok' | 'notPublished' | 'error', date, hours?,
stale?, message? }` where `hours` are **spot** prices; the price model is applied
at render time.

## Storage keys

All keys are prefixed `poweron.` in `localStorage`.

| Key | Content | Lifetime |
|---|---|---|
| `settings` | User settings | forever |
| `appliances` | Appliance list | forever |
| `spot.<area>.<date>` | One day of spot prices, compact with absolute intervals | 400 days |
| `tariffs.<area>.<grid>.<date>` | Hourly tariff parts | 45 days |
| `grid.companies` | Grid company list | 7 days |
| `weather.daily` | Daily weather features | 400 days |
| `ui.*` | Small UI state (expanded, dismissed banners) | forever |

Band thresholds live inside `settings` (`bands.full` and `bands.spot`).

## Conventions

- Views build HTML with template literals; anything from data or the user goes
  through `esc()`.
- Prices are `{ hour, price }`; after the price model each hour also has `spot`
  and `parts`.
- Price bands are strings (`free`, `cheap`, `fair`, `expensive`, `extreme`) used
  both as CSS classes (`band-fair`) and labels; `js/bands.js` owns them.
- Time is Danish wall clock everywhere; `time.js` converts absolute instants for
  the frontend. Usage joins UTC intervals to retain DST identity.
- `usage.js` is pure aggregation; `usage-view.js` returns HTML and mount.
  `app.js` loads the private Worker through `api.js`, then public spot and tariff
  data with three concurrent days. Request generations prevent stale results.
- `worker/worker.js` is separately deployed and contains server-side Eloverblik
  network calls. Browser network boundaries remain unchanged. No Worker secrets
  are shipped in frontend configuration. Usage credentials and readings are
  memory-only; only `poweron.ui.usageWorkerUrl` is persisted.
