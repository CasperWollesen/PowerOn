# Battery Lab (`LAB`)

A side page, separate from the PowerOn app, that answers one question for a
household with solar panels and a home battery:

> **What would the battery have earned, hour by hour, and how much more if it
> also charged from the grid when power is cheap?**

It replays a past period with real public prices, modelled or imported solar and
consumption, and several battery strategies side by side. It is a calculator for
deciding whether automatic battery control is worth building, not trading advice.
See [decision 0010](../decisions/0010-battery-lab-side-page.md).

### LAB-01 · Separate page
**Status:** Implemented · **Priority:** Must · **Verify:** review

The lab MUST live in `battery-lab/` as its own page and MUST NOT change what the
PowerOn app does.

- Served at `battery-lab/` next to the app, relative paths only, no build step and
  no new dependency. It may import PowerOn's pure modules (`js/time.js`,
  `js/format.js`, `js/storage.js`).
- Network access only in `battery-lab/data.js` (it reuses `getGridCompanies()` from
  `js/tariffs.js`); pure logic in `model.js`,
  `optimizer.js`, `summary.js` and `import.js`; `app.js` owns state and rendering.
- Stored keys use the `poweron.lab.` prefix through `js/storage.js`.
- The page is not part of the app shell or its tabs.

### LAB-02 · Real buy and sell prices
**Status:** Implemented · **Priority:** Must · **Verify:** test

Every simulated hour MUST use the public price that applied then, for the chosen
grid company.

- Buy price per hour = (spot + Energinet system and net tariffs + grid company
  tariff + electricity tax + supplier markup) × 1,25 VAT, from stromligning.dk
  `/api/prices` with hourly aggregation.
- Sell price per hour = stromligning.dk `/api/prices/production` (spot minus the
  production tariffs) minus the supplier's sell fee. Households get no VAT on sales.
- One request per calendar month and endpoint; completed months are cached.
- An optional electricity tax override replaces the historical tax in every hour,
  so the 2028 level (the reduction to the EU minimum ends after 2027) can be tried.
- Hours without a price are never priced at zero: the battery idles, the hour is
  left out of all money totals, and the number of such hours is shown.

### LAB-03 · Solar production estimate
**Status:** Implemented · **Priority:** Must · **Verify:** test

Without imported production, solar MUST be estimated per hour from Open-Meteo's
historical irradiance on the panel plane and labelled an estimate.

- Up to two panel arrays, each with kWp, tilt and azimuth (0 = south, −90 = east).
- kWh per hour = kWp × irradiance / 1000 × performance ratio × temperature factor,
  with cell temperature = air temperature + 0,03 × irradiance and a temperature
  coefficient (default −0,35 %/°C).
- Open-Meteo radiation is the mean of the preceding hour, so the value stamped
  `t + 1 h` belongs to the hour starting at `t`.
- The modelled yield in kWh/kWp is shown, so it can be compared with the real one.

### LAB-04 · Consumption model
**Status:** Implemented · **Priority:** Must · **Verify:** test

Without imported consumption, the house load MUST be modelled per hour from a few
numbers the owner knows.

- House: yearly kWh spread by a daily profile (weekday and weekend) and a seasonal
  factor; the profile averages to exactly the yearly figure over a whole year.
- Optional heat pump: yearly kWh spread by heating degree-hours below 17 °C from
  the same weather data, normalised to a typical Danish year.
- Electric cars: per car kWh per day, charger power, plug-in and ready hours.
  Smart charging fills the cheapest buy-price hours of each overnight window;
  otherwise charging starts at plug-in. Cars are charged from the house supply, so
  the battery may cover them when that pays.

### LAB-05 · Battery and grid limits
**Status:** Implemented · **Priority:** Must · **Verify:** test

The simulation MUST respect the physical limits the owner enters.

- Capacity, lowest and highest state of charge (default 20 % and 100 %), charge and
  discharge power, charge and discharge efficiency, starting state of charge.
- Export limit (default 10 kW); solar above it is curtailed. When the sell price is
  negative and curtailment is allowed, solar is curtailed instead of exported.
- Import limit (fuse): charging from the grid never pushes import above it.
- Hourly resolution: the energy of one hour is limited by power × 1 h.

### LAB-06 · Strategies side by side
**Status:** Implemented · **Priority:** Must · **Verify:** test

The same hours, prices, solar and consumption MUST be run through five strategies:

1. **No battery** — solar covers the house, the rest is bought or sold.
2. **Solar self-use** — the battery stores solar surplus and covers the house;
   it never sells and never buys. What a hybrid inverter does out of the box.
3. **Sell above a threshold** — self-use, plus selling from the battery at full
   power whenever the sell price is at or above a threshold.
4. **Smart, solar only** — the optimiser plans charging and selling, but the
   battery is only charged from solar surplus.
5. **Smart, solar + grid** — the optimiser may also charge from the grid.

The difference between 4 and 5 is reported as the value of grid charging.

### LAB-07 · Optimiser
**Status:** Implemented · **Priority:** Must · **Verify:** test

Strategies 4 and 5 MUST be planned by dynamic programming over the battery level,
minimising, per planning window:
import cost − export revenue + wear cost + grid-charging margin − value left.

- Levels are a grid of the usable range (default 0,5 kWh steps). Each hour picks
  the next level within the power limits.
- **Wear** (kr. per kWh delivered by the battery) is a real cost and reported
  separately.
  **Grid margin** (kr. per kWh charged from the grid) is only a hurdle: the plan
  must earn at least this much before it buys power to store. Neither is cash.
- **Day-ahead planner** (default): a plan is made at 13:00 every day, when
  tomorrow's prices are published, for the hours until tomorrow midnight, and the
  first 24 hours are carried out. The first plan starts at the period start with
  that day's prices.
- **Hindsight planner**: one plan over the whole period; an upper bound.
- Energy left at the end of a window is valued at the window's lowest buy price
  × discharge efficiency, less wear, never below zero.
- Solar and consumption inside a window are taken as known; this is optimistic and
  said on the page.

### LAB-08 · Where the stored energy came from
**Status:** Implemented · **Priority:** Should · **Verify:** test

For every hour the lab MUST report the energy flows and the origin of the energy
in the battery.

- Flows: solar → house, solar → battery, solar → grid, grid → house, grid → battery,
  battery → house, battery → grid, curtailed solar.
- Charging uses solar surplus first. The battery content is split into solar,
  grid and start energy; discharge takes from each in proportion (well mixed).
- Sold battery energy is split by origin, so the page can say how much of what was
  sold had been bought from the grid.

### LAB-09 · Period summary
**Status:** Implemented · **Priority:** Must · **Verify:** test

For the chosen period the lab MUST show, per strategy: net electricity cost, wear,
cost including wear, the saving against no battery, kWh sold from the battery,
kWh charged from the grid, and equivalent full cycles (also per year).

- The headline is the extra from grid charging (strategy 5 minus 4), in total and
  per month.
- A cumulative chart shows each strategy's saving against no battery over the period.
- Subscription fees are excluded; they are the same in every strategy.

### LAB-10 · Day, week and month explorer
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The owner MUST be able to step through the period by day, week or month.

- Previous / next buttons, a date field and a strategy picker.
- Day: prices (buy and sell), energy in and out of the battery, and the battery
  level split by origin, as three charts sharing the hour axis, plus an hourly
  table. Lists the best sell hours and the hours bought from the grid.
- Week and month: one bar per day for the saving, a table per day for every
  strategy, and selecting a day opens it.
- Every step shows the running total from the period start to the end of the step.

### LAB-11 · When does it pay?
**Status:** Implemented · **Priority:** Should · **Verify:** test

The lab MUST explain, with the current settings and the selected day's prices, the
price needed later for each kind of battery use to pay. With η = charge × discharge
efficiency, w = wear per kWh out of the battery and m = grid margin per kWh bought:

- grid → battery → grid: sell later > (buy now + m) ÷ η + w
- grid → battery → house: buy later > (buy now + m) ÷ η + w
- solar → battery → grid: sell later > sell now ÷ η + w
- solar → battery → house: buy later > sell now ÷ η + w

It shows the selected day's cheapest buy hour and best sell hour against these
thresholds. The formulas, margin and wear are visible and editable.

### LAB-12 · Import own measurements
**Status:** Implemented · **Priority:** Should · **Verify:** test

The owner MUST be able to load past measurements as CSV (inverter or Eloverblik
exports), and the lab MUST then compare what happened with what the strategies
would have done.

- Several files; delimiter, decimal comma, header row and Danish or ISO
  timestamps detected. Each column can be mapped to solar, house consumption, grid
  import, grid export, net grid, battery charge, battery discharge, net battery or
  state of charge, with unit (kWh, Wh, kW, W, %) and sign.
- Values are summed into Danish clock hours; a repeated autumn hour is kept apart.
- Missing consumption is derived from the energy balance when solar, grid and
  battery flows are known.
- Imported solar and consumption replace the models for the hours they cover.
- With grid import/export, an **Actual** row prices what was really bought and
  sold, and each day shows what the smart strategies would have changed.
- Imported data stays in memory, is never stored or sent anywhere, and is cleared
  on reload.

### LAB-13 · Settings behind expanders
**Status:** Implemented · **Priority:** Must · **Verify:** manual

All settings MUST sit in closed expanders, each with a one-line summary, and MUST
be remembered on the device (not imported data). Reset restores the defaults.

- Defaults describe a reference household: Horsens (DK1, Konstant), 60 kWh battery
  kept between 20 % and 100 %, 10 kW, solar, house and two electric cars. No names,
  addresses or exact coordinates; location is the town only.
- Unknown defaults (solar size, consumption, car use, supplier fees) are marked as
  assumptions on the page.

### LAB-14 · Look and language
**Status:** Implemented · **Priority:** Must · **Verify:** manual

- Dark by default with a light toggle that is remembered and applied before the
  first paint; usable at 375 px without horizontal scrolling.
- English UI, Danish number format through `js/format.js`.
- Charts have one value axis each, a legend for two or more series, hover details
  and a table view.
