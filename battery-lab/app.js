// Battery Lab page: state, rendering and events. The only lab module that touches
// the DOM; it decides when to load, calculate and render.
// @req LAB-01

import { load, save } from '../js/storage.js';
import { esc, num } from '../js/format.js';
import { addDays, nowInDenmark, shortDate, weekdayName } from '../js/time.js';
import {
  defaultSettings, normalizeSettings, buildHours, priceSeries, solarSeries, houseSeries,
  heatPumpSeries, carSeries, addSeries,
} from './model.js';
import { STRATEGIES, batteryConfig, runStrategy, hourAction } from './optimizer.js';
import { totals, dayRanges, stepRange, shiftStep, cumulativeSaving, saving, breakEven } from './summary.js';
import { parseCsv, describeCsv, toHourly, completeHours, coverage, actualRows, ROLES, UNITS } from './import.js';
import { loadPrices, loadWeather, getGridCompanies } from './data.js';
import { lineChart, barChart, dayPanels, legend } from './charts.js';

const MIN_DATE = '2023-01-01';
const MAX_DAYS = 1100;
const TAX_2028 = 0.76;

const INFO = {
  none: { label: 'No battery', color: 'var(--c-gray)', text: 'Solar covers the house; the rest is bought or sold.' },
  self: { label: 'Solar self-use', color: 'var(--c-yellow)', text: 'Stores solar surplus and covers the house. Never sells from the battery, never buys into it. What a hybrid inverter does out of the box.' },
  threshold: { label: 'Sell above threshold', color: 'var(--c-aqua)', text: 'Self-use, plus selling from the battery at full power whenever the sell price is at or above the threshold.' },
  smartSolar: { label: 'Smart, solar only', color: 'var(--c-orange)', text: 'Plans charging and selling every day at 13:00 when tomorrow\'s prices are out. Charges only from solar.' },
  smartGrid: { label: 'Smart, solar + grid', color: 'var(--c-blue)', text: 'As smart, solar only, but may also buy power into the battery when that pays after losses, wear and margin.' },
  actual: { label: 'Actual (imported)', color: 'var(--c-magenta)', text: 'What the imported meter data says was bought and sold, priced the same way.' },
};
const ROLE_LABELS = {
  ignore: '–', pv: 'Solar production', load: 'House consumption', import: 'Grid import', export: 'Grid export',
  gridNet: 'Grid net (+ import)', charge: 'Battery charge', discharge: 'Battery discharge',
  batteryNet: 'Battery net (+ discharge)', soc: 'State of charge',
};
const ACTION_LABELS = { sell: 'Sell', buy: 'Buy to battery', store: 'Store solar', cover: 'Cover house', idle: '–' };

const state = {
  settings: normalizeSettings(load('lab.settings')),
  period: validPeriod(load('lab.period')) ?? defaultPeriod(),
  view: { unit: 'day', date: null, strategy: 'smartGrid' },
  status: { kind: 'idle', text: '' },
  data: { pricesKey: '', prices: null, weatherKey: '', weather: null },
  sim: null,
  imports: [],
  useImported: true,
  companies: [],
  wearCalc: { price: 120000, cycles: 6000 },
  generation: 0,
};

const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------- period

function yesterday() {
  return addDays(nowInDenmark().date, -1);
}

function defaultPeriod() {
  const to = yesterday();
  return { from: addDays(to, -364), to };
}

function validPeriod(p) {
  if (!p || typeof p.from !== 'string' || typeof p.to !== 'string') return null;
  const to = p.to > yesterday() ? yesterday() : p.to;
  const from = p.from < MIN_DATE ? MIN_DATE : p.from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  if (dayCount(from, to) > MAX_DAYS) return { from: addDays(to, -(MAX_DAYS - 1)), to };
  return { from, to };
}

function dayCount(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

// ---------------------------------------------------------------- formatting

function money(v, decimals = 0) {
  return Number.isFinite(v) ? `${num(v, decimals)} kr.` : '–';
}

function signed(v, decimals = 0) {
  if (!Number.isFinite(v)) return '–';
  const text = money(v, decimals);
  return v > 0.5 * 10 ** -decimals ? `+${text}` : text;
}

function energy(v, decimals = 0) {
  return Number.isFinite(v) ? `${num(v, decimals)} kWh` : '–';
}

function price(v) {
  return Number.isFinite(v) ? num(v, 2) : '–';
}

function pct(v, decimals = 0) {
  return Number.isFinite(v) ? `${num(v, decimals)} %` : '–';
}

function hourRange(from, to) {
  return `${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`;
}

function longDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${weekdayName(date)} ${d} ${month} ${y}`;
}

function monthName(date) {
  const [y, m] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function isoWeek(date) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round((dt - firstThursday) / 604800000 - ((firstThursday.getUTCDay() + 6) % 7 - 3) / 7);
}

// ---------------------------------------------------------------- settings helpers

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

function inputValue(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace('.', ',');
}

function field(path, label, { unit = '', assumed = false } = {}) {
  return `<label class="field"><span class="${assumed ? 'assumed' : ''}">${esc(label)}</span>`
    + `<span class="control"><input type="text" inputmode="decimal" autocomplete="off" data-path="${path}" value="${esc(inputValue(getPath(state.settings, path)))}">`
    + `${unit ? `<em>${esc(unit)}</em>` : ''}</span></label>`;
}

function check(path, label) {
  return `<label class="field check"><input type="checkbox" data-path="${path}"${getPath(state.settings, path) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
}

function select(path, label, options) {
  const value = getPath(state.settings, path);
  return `<label class="field"><span>${esc(label)}</span><select data-path="${path}">${options.map(([v, text]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}

function azimuthName(az) {
  const names = [[-180, 'north'], [-135, 'north-east'], [-90, 'east'], [-45, 'south-east'], [0, 'south'], [45, 'south-west'], [90, 'west'], [135, 'north-west'], [180, 'north']];
  return names.reduce((a, b) => (Math.abs(b[0] - az) < Math.abs(a[0] - az) ? b : a))[1];
}

function companyName(id) {
  return state.companies.find((c) => c.id === id)?.name ?? id;
}

// @req LAB-13
function groupSummaries() {
  const s = state.settings;
  const b = s.battery;
  const arrays = s.solar.arrays.filter((a) => a.kwp > 0);
  const carText = s.cars.filter((c) => c.kwhPerDay > 0).map((c) => num(c.kwhPerDay, 0)).join(' + ');
  return {
    battery: `${num(b.capacityKwh, 0)} kWh · kept ${num(b.minSocPct, 0)}–${num(b.maxSocPct, 0)} % · ${num(b.chargeKw, 1).replace(/,0$/, '')} kW in / ${num(b.dischargeKw, 1).replace(/,0$/, '')} kW out · ${num(b.chargeEff, 0)} % × ${num(b.dischargeEff, 0)} %`,
    solar: arrays.length ? arrays.map((a) => `${num(a.kwp, 1).replace(/,0$/, '')} kWp ${azimuthName(a.azimuth)} ${num(a.tilt, 0)}°`).join(' + ') + ` · PR ${num(s.solar.performanceRatio, 0)} %` : 'No solar',
    house: `House ${num(s.house.annualKwh, 0)} kWh/yr · heat pump ${num(s.house.heatPumpKwh, 0)} kWh/yr · cars ${carText || 'none'}${carText ? ' kWh/day' : ''}`,
    prices: `${companyName(s.prices.gridCompany)} (${s.prices.area}) · markup ${price(s.prices.buyMarkup)} · sell fee ${price(s.prices.sellFee)} · tax ${s.prices.taxOverride === null ? 'as charged' : `${price(s.prices.taxOverride)} kr./kWh`} · export ${num(s.grid.exportKw, 0)} kW`,
    strategy: `Wear ${price(s.strategy.wear)} kr./kWh · grid margin ${price(s.strategy.gridMargin)} · threshold ${price(s.strategy.sellThreshold)} · ${s.strategy.planner === 'dayAhead' ? 'day-ahead planner' : 'hindsight planner'}`,
    data: state.imports.length ? `${state.imports.length} file${state.imports.length > 1 ? 's' : ''} loaded${state.sim?.coverage ? ` · ${num(state.sim.coverage.hours, 0)} hours in the period` : ''}` : 'No files loaded – everything is modelled',
  };
}

function updateSummaries() {
  const sums = groupSummaries();
  for (const [key, text] of Object.entries(sums)) {
    const el = document.querySelector(`[data-sum="${key}"]`);
    if (el) el.textContent = text;
  }
}

function group(key, title, body, { assumed = false } = {}) {
  return `<details class="group" data-group="${key}"><summary><span class="title${assumed ? ' assumed' : ''}">${esc(title)}</span>`
    + `<span class="sum" data-sum="${key}">${esc(groupSummaries()[key])}</span></summary><div class="body">${body}</div></details>`;
}

// @req LAB-13
function settingsHtml() {
  const s = state.settings;
  const companies = state.companies.filter((c) => c.priceArea === s.prices.area);
  const companyOptions = companies.length ? companies.map((c) => [c.id, c.name]) : [[s.prices.gridCompany, companyName(s.prices.gridCompany)]];
  const hours = Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, '0')}:00`]);
  const car = (i) => `<p class="sub">Car ${i + 1}</p><div class="fields">
      ${field(`cars.${i}.kwhPerDay`, 'Charging per day', { unit: 'kWh', assumed: true })}
      ${field(`cars.${i}.chargerKw`, 'Charger power', { unit: 'kW', assumed: true })}
      ${selectNumber(`cars.${i}.plugIn`, 'Plugged in at', hours)}
      ${selectNumber(`cars.${i}.ready`, 'Full by', hours)}
      ${check(`cars.${i}.smart`, 'Smart charging (cheapest hours)')}
    </div>`;
  const array = (i) => `<p class="sub">Panel array ${i + 1}</p><div class="fields">
      ${field(`solar.arrays.${i}.kwp`, 'Size', { unit: 'kWp', assumed: true })}
      ${field(`solar.arrays.${i}.tilt`, 'Tilt', { unit: '°', assumed: true })}
      ${field(`solar.arrays.${i}.azimuth`, 'Direction', { unit: '° (0 = south, −90 = east)', assumed: true })}
    </div>`;
  const wear = wearSuggestion();
  return `
    ${group('battery', 'Battery', `<div class="fields">
      ${field('battery.capacityKwh', 'Capacity', { unit: 'kWh' })}
      ${field('battery.minSocPct', 'Never below', { unit: '%' })}
      ${field('battery.maxSocPct', 'Never above', { unit: '%' })}
      ${field('battery.startSocPct', 'Level at period start', { unit: '%' })}
      ${field('battery.chargeKw', 'Charge power', { unit: 'kW', assumed: true })}
      ${field('battery.dischargeKw', 'Discharge power', { unit: 'kW' })}
      ${field('battery.chargeEff', 'Charge efficiency', { unit: '%', assumed: true })}
      ${field('battery.dischargeEff', 'Discharge efficiency', { unit: '%', assumed: true })}
    </div><p class="hint">Efficiencies are AC to battery and battery to AC. 95 % × 95 % ≈ 90 % round trip, typical for an LFP battery on a hybrid inverter.</p>`)}
    ${group('solar', 'Solar panels', `${array(0)}${array(1)}<div class="fields">
      ${field('solar.performanceRatio', 'Performance ratio', { unit: '%' })}
      ${field('solar.tempCoeff', 'Temperature coefficient', { unit: '%/°C' })}
    </div><p class="hint" data-solar-hint>${solarHint()}</p>`, { assumed: true })}
    ${group('house', 'House and cars', `<div class="fields">
      ${field('house.annualKwh', 'House, per year (without heat pump and cars)', { unit: 'kWh', assumed: true })}
      ${field('house.heatPumpKwh', 'Heat pump, per normal year', { unit: 'kWh', assumed: true })}
    </div>${car(0)}${car(1)}<p class="hint">The house follows a typical Danish day and season. The heat pump follows the outdoor temperature below 17 °C. Imported consumption replaces all of this for the hours it covers.</p>`, { assumed: true })}
    ${group('prices', 'Prices and grid', `<div class="fields">
      ${select('prices.area', 'Price area', [['DK1', 'DK1 (west)'], ['DK2', 'DK2 (east)']])}
      ${select('prices.gridCompany', 'Grid company', companyOptions)}
      ${field('prices.buyMarkup', 'Supplier markup on purchases (excl. VAT)', { unit: 'kr./kWh', assumed: true })}
      ${field('prices.sellFee', 'Supplier fee on sales', { unit: 'kr./kWh', assumed: true })}
      ${field('prices.taxOverride', 'Electricity tax override (blank = as charged)', { unit: 'kr./kWh excl. VAT' })}
      ${field('grid.exportKw', 'Export limit', { unit: 'kW' })}
      ${field('grid.importKw', 'Import limit (fuse)', { unit: 'kW', assumed: true })}
    </div>
    <div class="row"><button data-action="tax-2028">Try the 2028 tax (≈ ${price(TAX_2028)} kr./kWh)</button><button data-action="tax-actual">Tax as charged</button></div>
    <p class="hint">Buy price = (spot + Energinet tariffs + grid tariff + electricity tax + markup) × 1,25 VAT. Sell price = spot − production tariffs − sell fee, no VAT. The electricity tax is 0,008 kr./kWh in 2026 and 2027 and returns to roughly ${price(TAX_2028)} from 2028 (60,9 øre at 2015 level, indexed – an estimate). Subscriptions are left out: they are the same in every strategy.</p>`)}
    ${group('strategy', 'Strategy, wear and margin', `<div class="fields">
      ${field('strategy.wear', 'Battery wear per kWh delivered', { unit: 'kr./kWh' })}
      ${field('strategy.gridMargin', 'Extra margin before buying to store', { unit: 'kr./kWh' })}
      ${field('strategy.sellThreshold', 'Threshold for "Sell above threshold"', { unit: 'kr./kWh' })}
      ${select('strategy.planner', 'Planner', [['dayAhead', 'Day-ahead (realistic)'], ['hindsight', 'Hindsight (upper bound)']])}
      ${field('strategy.stepKwh', 'Optimiser step', { unit: 'kWh' })}
      ${check('strategy.curtail', 'Curtail solar when the sell price is negative')}
    </div>
    <p class="hint" data-rule>${ruleOfThumb()}</p>
    <p class="sub">Wear calculator</p>
    <div class="fields">
      <label class="field"><span>Replacement price of the battery</span><span class="control"><input type="text" inputmode="decimal" data-wear="price" value="${esc(inputValue(state.wearCalc.price))}"><em>kr.</em></span></label>
      <label class="field"><span>Cycle life to 70–80 %</span><span class="control"><input type="text" inputmode="decimal" data-wear="cycles" value="${esc(inputValue(state.wearCalc.cycles))}"><em>cycles</em></span></label>
    </div>
    <p class="hint" data-wear-result>${wear.text}</p>
    <div class="row"><button data-action="use-wear" data-wear-use>Use ${price(wear.value)} kr./kWh</button></div>
    <p class="hint">Wear is real money and counted in every total. The margin is only a hurdle for buying from the grid: it is not paid to anyone, it just stops the battery from cycling for a few øre. LFP batteries also age with time, so if the battery would reach its calendar age before its cycle life, extra cycles cost less than the calculator says.</p>`)}
    ${group('data', 'Your own measurements', `<div id="import-body">${importHtml()}</div>`)}`;
}

function solarHint() {
  const sim = state.sim;
  const yieldText = sim ? ` Modelled yield in this period: <b>${num(sim.yieldPerKwp, 0)} kWh/kWp</b>, ${energy(sim.pvTotal)} in total. Compare with the inverter's own figure and adjust size or performance ratio until they match.` : '';
  return `Estimated from Open-Meteo's irradiance on the panel plane for ${esc(state.settings.location.label)}.${yieldText}`;
}

function selectNumber(path, label, options) {
  const value = getPath(state.settings, path);
  return `<label class="field"><span>${esc(label)}</span><select data-path="${path}" data-number>${options.map(([v, text]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}

function wearSuggestion() {
  const cfg = batteryConfig(state.settings);
  const usable = cfg.eMax - cfg.eMin;
  const { price: p, cycles } = state.wearCalc;
  const value = p > 0 && cycles > 0 && usable > 0 ? p / (cycles * usable * cfg.etaD) : 0;
  return {
    value,
    text: `${money(p)} ÷ (${num(cycles, 0)} cycles × ${energy(usable, 1)} usable × ${num(cfg.etaD * 100, 0)} %) = <b>${price(value)} kr. per kWh delivered</b>.`,
  };
}

// @req LAB-11
function ruleOfThumb() {
  const cfg = batteryConfig(state.settings);
  const eta = cfg.etaC * cfg.etaD;
  const buy = 1;
  const need = (buy + cfg.margin) / eta + cfg.wear;
  const solar = 0.5;
  return `Rule of thumb with these settings: power bought for ${price(buy)} kr./kWh (full price) must later be worth at least <b>${price(need)} kr./kWh</b> – sold, or saved by not buying – before storing it pays. Solar that could be sold now for ${price(solar)} must later be worth at least <b>${price(solar / eta + cfg.wear)}</b>. Round trip ${pct(eta * 100, 1)}.`;
}

// ---------------------------------------------------------------- import UI

// @req LAB-12
function importHtml() {
  const files = state.imports.map((f, fi) => {
    const timeOptions = f.columns.map((c) => `<option value="${c.index}"${c.index === f.timeColumn ? ' selected' : ''}>${esc(c.title)}</option>`).join('');
    const rows = f.columns.filter((c) => c.index !== f.timeColumn).map((c) => {
      const sample = f.data.slice(0, 3).map((r) => r[c.index] ?? '').join(' · ');
      return `<tr><td>${esc(c.title)}</td><td class="muted">${esc(sample.slice(0, 40))}</td>
        <td><select data-import="role" data-file="${fi}" data-col="${c.index}">${ROLES.map((r) => `<option value="${r}"${r === c.role ? ' selected' : ''}>${esc(ROLE_LABELS[r])}</option>`).join('')}</select></td>
        <td><select data-import="unit" data-file="${fi}" data-col="${c.index}">${UNITS.map((u) => `<option${u === c.unit ? ' selected' : ''}>${u}</option>`).join('')}</select></td>
        <td><input type="checkbox" data-import="invert" data-file="${fi}" data-col="${c.index}"${c.invert ? ' checked' : ''} aria-label="Invert sign"></td></tr>`;
    }).join('');
    return `<div class="card" style="background:var(--surface-2)">
      <div class="row spread"><b>${esc(f.name)}</b><span class="muted small">${num(f.rows, 0)} rows</span><button data-action="import-remove" data-file="${fi}">Remove</button></div>
      <div class="fields">
        <label class="field"><span>Time column</span><select data-import="time" data-file="${fi}">${timeOptions}</select></label>
        <label class="field check"><input type="checkbox" data-import="intervalEnd" data-file="${fi}"${f.intervalEnd ? ' checked' : ''}><span>Timestamps mark the end of each interval</span></label>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Column</th><th>First values</th><th>Means</th><th>Unit</th><th>−</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }).join('');
  const cov = state.sim?.coverage;
  const covText = cov ? `In the period: ${num(cov.hours, 0)} of ${num(state.sim.hours.length, 0)} hours have imported values – solar ${num(cov.pv, 0)}, consumption ${num(cov.load, 0)}, grid ${num(cov.grid, 0)}, battery ${num(cov.battery, 0)}, state of charge ${num(cov.soc, 0)}.` : '';
  const range = importedRange();
  return `<p class="hint">Load CSV exports from the inverter (e.g. Fronius Solar.web: production, consumption, feed-in, purchase, battery charge/discharge, state of charge) or from Eloverblik (hourly import and export meter readings). Several files can be combined. <b>The files stay in this browser tab</b>: they are not stored and not sent anywhere, and a reload forgets them.</p>
    <div class="row"><input type="file" accept=".csv,.txt,text/csv" multiple data-action="import-files" aria-label="CSV files"></div>
    ${files}
    ${state.imports.length ? `<p class="hint">${covText || 'Calculate to see the coverage.'}</p>
      ${range && cov && cov.hours === 0 ? `<div class="row"><button data-action="import-period">Use the imported dates (${shortDate(range.first)}–${shortDate(range.last)})</button></div>` : ''}
      <label class="field check"><input type="checkbox" data-action="use-imported"${state.useImported ? ' checked' : ''}><span>Use imported solar and consumption in the strategies</span></label>` : ''}`;
}

function importedHours() {
  if (!state.imports.length) return null;
  const cfg = batteryConfig(state.settings);
  return completeHours(toHourly(state.imports), { capacityKwh: cfg.capacity, etaC: cfg.etaC, etaD: cfg.etaD });
}

function importedRange() {
  const hours = importedHours();
  if (!hours?.size) return null;
  const keys = [...hours.keys()].sort((a, b) => a - b);
  return { first: nowInDenmark(new Date(keys[0])).date, last: nowInDenmark(new Date(keys[keys.length - 1])).date };
}

async function readFile(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------------------------------------------------------------- simulation

function dataKeys() {
  const s = state.settings;
  const { from, to } = state.period;
  const arrays = s.solar.arrays.map((a) => (a.kwp > 0 ? `${a.tilt}/${a.azimuth}` : '-')).join(',');
  return {
    prices: `${s.prices.gridCompany}|${from}|${to}`,
    weather: `${s.location.lat}|${s.location.lon}|${arrays}|${from}|${to}`,
  };
}

/** Fetch what is missing for the current period and settings, then simulate. */
async function calculate() {
  const generation = ++state.generation;
  const keys = dataKeys();
  const { from, to } = state.period;
  try {
    if (state.data.pricesKey !== keys.prices) {
      setStatus('loading', 'Loading prices…', 0);
      const prices = await loadPrices(state.settings.prices.gridCompany, from, to, {
        onProgress: (done, all) => generation === state.generation && setStatus('loading', `Loading prices… ${done}/${all} months`, done / all),
      });
      if (generation !== state.generation) return;
      if (!prices.buy.length) throw new Error(prices.errors[0] ?? 'No prices returned for this period.');
      state.data.prices = prices;
      state.data.pricesKey = keys.prices;
    }
    if (state.data.weatherKey !== keys.weather) {
      setStatus('loading', 'Loading solar irradiance…', 0.9);
      const weather = await loadWeather(state.settings.location, state.settings.solar.arrays, from, to);
      if (generation !== state.generation) return;
      state.data.weather = weather;
      state.data.weatherKey = keys.weather;
    }
    setStatus('calculating', 'Calculating five strategies…');
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (generation !== state.generation) return;
    const started = performance.now();
    state.sim = simulate();
    state.sim.ms = performance.now() - started;
    setStatus('ready', '');
    renderResults();
    renderExplorer();
    refreshImport();
    updateSummaries();
    refreshSolarHint();
  } catch (err) {
    if (generation !== state.generation) return;
    setStatus('error', err.message || String(err));
  }
}

let recalcTimer = 0;
function scheduleCalculate(delay = 350) {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(calculate, delay);
}

// @req LAB-06 LAB-12
function simulate() {
  const s = state.settings;
  const { from, to } = state.period;
  const hours = buildHours(from, to);
  const prices = priceSeries(hours, state.data.prices.buy, state.data.prices.sell, s.prices);
  const solar = solarSeries(hours, state.data.weather, s.solar);
  const house = houseSeries(hours, s.house.annualKwh);
  const heat = heatPumpSeries(hours, s.house.heatPumpKwh, state.data.weather.temp);
  const cars = carSeries(hours, s.cars, prices.buy, prices.priced);
  const pv = Float64Array.from(solar.pv);
  const load = addSeries(house, heat, cars);
  const cfg = batteryConfig(s);

  const imported = importedHours();
  let cov = null;
  let mask = null;
  let actual = null;
  if (imported) {
    cov = coverage(imported, hours);
    if (state.useImported) {
      hours.forEach((h, i) => {
        const v = imported.get(h.t);
        if (v?.pv !== undefined) pv[i] = v.pv;
        if (v?.load !== undefined) load[i] = v.load;
      });
    }
    if (cov.grid) {
      actual = actualRows(imported, hours, prices, { wear: cfg.wear, etaD: cfg.etaD });
      mask = Uint8Array.from(actual, (r) => (r.priced ? 1 : 0));
    }
  }
  const inp = { hours, pv, load, buy: prices.buy, sell: prices.sell, priced: prices.priced };
  const results = {};
  for (const id of STRATEGIES) results[id] = runStrategy(inp, cfg, id).rows;
  if (actual) results.actual = actual;
  const kwp = s.solar.arrays.reduce((a, b) => a + b.kwp, 0);
  const pvTotal = pv.reduce((a, b) => a + b, 0);
  return {
    hours, inp, cfg, prices, results, mask, coverage: cov,
    days: dayRanges(hours),
    usable: cfg.eMax - cfg.eMin,
    solarMissing: solar.missing,
    pvTotal,
    yieldPerKwp: kwp > 0 ? pvTotal / kwp : 0,
    loadTotal: load.reduce((a, b) => a + b, 0),
    carsTotal: cars.reduce((a, b) => a + b, 0),
  };
}

function strategyTotals(id, from, to, mask = null) {
  return totals(state.sim.results[id], from, to, { usable: state.sim.usable, mask });
}

// ---------------------------------------------------------------- rendering

function setStatus(kind, text, progress = null) {
  state.status = { kind, text, progress };
  const el = $('#status');
  if (!el) return;
  const bar = progress !== null && kind === 'loading' ? `<span class="bar"><i style="width:${Math.round(progress * 100)}%"></i></span>` : '';
  const ready = kind === 'ready' && state.sim
    ? `<span class="muted small">${num(state.sim.hours.length, 0)} hours · ${num(state.sim.days.length, 0)} days · calculated in ${num(state.sim.ms / 1000, 1)} s</span>` : '';
  el.innerHTML = kind === 'error' ? `<span class="error">${esc(text)}</span> <button data-action="calculate">Try again</button>`
    : `${text ? `<span>${esc(text)}</span>` : ''}${bar}${ready}`;
  const button = $('[data-action="calculate"].primary');
  if (button) button.disabled = kind === 'loading' || kind === 'calculating';
}

function contentWidth(el) {
  const style = getComputedStyle(el);
  return Math.max(260, Math.floor(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
}

function renderPage() {
  const { from, to } = state.period;
  const light = document.documentElement.dataset.theme === 'light';
  $('#lab').innerHTML = `
    <header class="topbar">
      <div>
        <h1>Battery Lab</h1>
        <p>What would a home battery with solar have earned on real Danish prices – and how much more if it also charged from the grid when power was cheap? Pick a period, step through it day by day, and compare five strategies on the same hours.</p>
      </div>
      <button class="icon" data-action="theme" aria-label="Switch to ${light ? 'dark' : 'light'} theme">${light ? '☾ Dark' : '☀ Light'}</button>
    </header>
    <section class="card" id="setup">
      <h2>Setup</h2>
      <p class="hint">The defaults describe a reference household near Horsens: a 60 kWh battery kept between 20 % and 100 %, a 10 kW inverter, solar panels, a house and two electric cars. <span class="flag">⚑</span> marks guesses – replace them with the real numbers.</p>
      <div id="settings">${settingsHtml()}</div>
      <div class="row" style="margin-top:10px"><button data-action="reset">Reset to defaults</button></div>
    </section>
    <section class="card" id="period-card">
      <h2>Period</h2>
      <div class="row">
        <label class="row small">From <input type="date" data-period="from" value="${from}" min="${MIN_DATE}" max="${yesterday()}"></label>
        <label class="row small">To <input type="date" data-period="to" value="${to}" min="${MIN_DATE}" max="${yesterday()}"></label>
        <button class="primary" data-action="calculate">Calculate</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button data-action="preset" data-days="7">Last 7 days</button>
        <button data-action="preset" data-days="30">Last 30 days</button>
        <button data-action="preset" data-days="365">Last 12 months</button>
        <button data-action="preset" data-year="this">This year</button>
        <button data-action="preset" data-year="last">Last year</button>
      </div>
      <div id="status" class="status" aria-live="polite"></div>
    </section>
    <section class="card" id="results"></section>
    <section class="card" id="explorer"></section>
    <section class="card" id="method">${methodHtml()}</section>
    <footer>Prices: <a href="https://stromligning.dk/">stromligning.dk</a> · Solar irradiance and temperature: <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0) · Specification: <a href="../docs/spec/battery-lab.md">LAB</a> · A side page of <a href="../">PowerOn</a>. Estimates for deciding, not an invoice and not advice.</footer>`;
  setStatus(state.status.kind, state.status.text, state.status.progress);
  renderResults();
  renderExplorer();
}

function rerenderSettings() {
  const open = new Set([...document.querySelectorAll('details.group[open]')].map((d) => d.dataset.group));
  $('#settings').innerHTML = settingsHtml();
  for (const key of open) document.querySelector(`details.group[data-group="${key}"]`)?.setAttribute('open', '');
}

function refreshImport() {
  const el = $('#import-body');
  if (el) el.innerHTML = importHtml();
}

function refreshSolarHint() {
  const el = document.querySelector('[data-solar-hint]');
  if (el) el.innerHTML = solarHint();
}

// Hints that depend on settings, updated in place so the field being edited keeps focus.
function refreshHints() {
  const rule = document.querySelector('[data-rule]');
  if (rule) rule.innerHTML = ruleOfThumb();
  const wear = wearSuggestion();
  const result = document.querySelector('[data-wear-result]');
  if (result) result.innerHTML = wear.text;
  const use = document.querySelector('[data-wear-use]');
  if (use) use.textContent = `Use ${price(wear.value)} kr./kWh`;
}

// @req LAB-09
function renderResults() {
  const el = $('#results');
  if (!el) return;
  const sim = state.sim;
  if (!sim) {
    el.innerHTML = `<h2>Result</h2><p class="muted">Pick a period and press Calculate. A year takes a few seconds the first time; completed months are cached after that.</p>`;
    return;
  }
  const n = sim.hours.length;
  const T = Object.fromEntries(Object.keys(sim.results).map((id) => [id, strategyTotals(id, 0, n)]));
  const months = sim.days.length / 30.44;
  const gridExtra = T.smartSolar.netWithWear - T.smartGrid.netWithWear;
  const smartVsSelf = T.self.netWithWear - T.smartSolar.netWithWear;
  const best = T.none.net - T.smartGrid.netWithWear;
  const g = T.smartGrid;
  const daysBuying = sim.days.filter((d) => totals(sim.results.smartGrid, d.from, d.to).gridToBat > 0.05).length;
  const width = contentWidth(el);

  const rows = ['none', 'self', 'threshold', 'smartSolar', 'smartGrid'].map((id) => strategyRow(id, T[id], T.none));
  let actualNote = '';
  if (T.actual) {
    const covered = (id) => strategyTotals(id, 0, n, sim.mask);
    const A = T.actual;
    rows.push(strategyRow('actual', A, covered('none'), true));
    actualNote = `<p class="hint">Actual covers ${num(A.hours, 0)} of ${num(n, 0)} hours. On those hours: actual ${money(A.netWithWear)}, smart solar only ${money(covered('smartSolar').netWithWear)}, smart solar + grid ${money(covered('smartGrid').netWithWear)} (cost incl. wear). Over a few days the battery's level at the start decides most of the difference; compare whole weeks or months.</p>`;
  }

  const cumulative = ['self', 'threshold', 'smartSolar', 'smartGrid', ...(T.actual ? ['actual'] : [])].map((id) => ({
    id,
    label: INFO[id].label,
    color: INFO[id].color,
    values: cumulativeSaving(sim.days, sim.results[id], sim.results.none, id === 'actual' ? sim.mask : null).map((p) => p.value),
  }));
  const labels = sim.days.map((d) => shortDate(d.date));
  const tips = sim.days.map((d, i) => `${longDate(d.date)}\nSaving since ${shortDate(sim.days[0].date)}:\n${cumulative.map((s) => `${s.label}: ${money(s.values[i])}`).join('\n')}`);

  el.innerHTML = `
    <h2>Result · ${shortDate(sim.days[0].date)}/${sim.days[0].date.slice(0, 4)} – ${shortDate(sim.days[sim.days.length - 1].date)}/${sim.days[sim.days.length - 1].date.slice(0, 4)}</h2>
    <div class="hero"><span class="value num">${signed(gridExtra)}</span>
      <span class="label">extra from also charging from the grid, on top of smart selling of solar – about <b>${signed(gridExtra / months)}</b> per month.</span></div>
    <p>Smart selling of stored solar is worth <b>${signed(smartVsSelf)}</b> against plain self-use. The best strategy saves <b>${money(best)}</b> against having no battery at all. All figures include battery wear at ${price(sim.cfg.wear)} kr./kWh.</p>
    ${notices(sim, T)}
    <div class="tiles">
      <div class="tile"><div class="label">Sold from the battery</div><div class="value num">${energy(g.batToGrid)}</div><div class="note">${pct(g.batToGrid > 0 ? (100 * g.soldGrid) / g.batToGrid : 0)} of it bought from the grid · ${money(g.soldRevenue)}</div></div>
      <div class="tile"><div class="label">Bought into the battery</div><div class="value num">${energy(g.gridToBat)}</div><div class="note">on ${num(daysBuying, 0)} of ${num(sim.days.length, 0)} days</div></div>
      <div class="tile"><div class="label">Battery cycles per year</div><div class="value num">${num(g.cyclesPerYear, 0)}</div><div class="note">self-use: ${num(T.self.cyclesPerYear, 0)} · smart, solar only: ${num(T.smartSolar.cyclesPerYear, 0)}</div></div>
      <div class="tile"><div class="label">Solar · consumption</div><div class="value num">${energy(sim.pvTotal)}</div><div class="note">${num(sim.yieldPerKwp, 0)} kWh/kWp · house and cars ${energy(sim.loadTotal)}</div></div>
    </div>
    <h3>The strategies</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Strategy</th><th>Electricity (− = income)</th><th>Wear</th><th>Cost incl. wear</th><th>Saving vs no battery</th><th>Sold from battery</th><th>Bought to battery</th><th>Cycles/yr</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
    ${actualNote}
    <details class="more"><summary>What each strategy does</summary><ul class="small">${Object.entries(INFO).filter(([id]) => id !== 'actual' || T.actual).map(([, i]) => `<li><b>${esc(i.label)}</b> – ${esc(i.text)}</li>`).join('')}</ul></details>
    <h3>Saving against no battery, day by day</h3>
    ${legend(cumulative.map((s) => ({ label: s.label, color: s.color, line: true })))}
    ${lineChart({ width, series: cumulative, labels, tips })}`;
}

function strategyRow(id, t, base, isActual = false) {
  const save = base.net - t.netWithWear;
  return `<tr class="${id === 'smartGrid' ? 'highlight' : ''}"><td><span class="key" style="background:${INFO[id].color}"></span>${esc(INFO[id].label)}</td>
    <td>${money(t.net)}</td><td>${money(t.wear)}</td><td>${money(t.netWithWear)}</td>
    <td class="${save > 0.5 ? 'pos' : save < -0.5 ? 'neg' : ''}">${id === 'none' ? '–' : signed(save)}</td>
    <td>${isActual ? '–' : energy(t.batToGrid)}</td><td>${isActual ? '–' : energy(t.gridToBat)}</td><td>${id === 'none' ? '–' : num(t.cyclesPerYear, 0)}</td></tr>`;
}

function notices(sim, T) {
  const out = [];
  if (sim.prices.missing) out.push(`${num(sim.prices.missing, 0)} hours have no price; the battery idles in them and they are left out of every total.`);
  if (sim.prices.sellFromSpot) out.push(`${num(sim.prices.sellFromSpot, 0)} hours have no production price; the spot price is used as sell price there.`);
  if (sim.solarMissing) out.push(`${num(sim.solarMissing, 0)} hours have no irradiance data; solar counts as zero there.`);
  if (state.settings.prices.taxOverride !== null) out.push(`Electricity tax overridden to ${price(state.settings.prices.taxOverride)} kr./kWh excl. VAT in every hour.`);
  if (state.settings.strategy.planner === 'hindsight') out.push('Hindsight planner: one plan for the whole period with every price known. This is an upper bound, not something a controller can do.');
  if (T.smartGrid.gridToBat < 1) out.push('The optimiser found no hour where buying power to store paid, with this wear and margin.');
  return out.map((t) => `<p class="notice small">${esc(t)}</p>`).join('');
}

// @req LAB-10
function renderExplorer() {
  const el = $('#explorer');
  if (!el) return;
  const sim = state.sim;
  if (!sim) {
    el.innerHTML = '<h2>Day by day</h2><p class="muted">Calculate a period first.</p>';
    return;
  }
  const v = state.view;
  if (!v.date || !sim.days.some((d) => d.date === v.date)) v.date = sim.days[sim.days.length - 1].date;
  const step = stepRange(sim.days, v.unit, v.date);
  const prev = shiftStep(sim.days, v.unit, v.date, -1);
  const next = shiftStep(sim.days, v.unit, v.date, 1);
  const title = v.unit === 'day' ? longDate(step.first)
    : v.unit === 'week' ? `Week ${isoWeek(step.first)} · ${shortDate(step.first)}–${shortDate(step.last)} ${step.last.slice(0, 4)}`
      : `${monthName(step.first)}${step.days.length < 28 ? ` (${shortDate(step.first)}–${shortDate(step.last)} in the period)` : ''}`;
  const unitButtons = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([u, label]) => `<button data-action="unit" data-unit="${u}" aria-pressed="${v.unit === u}">${label}</button>`).join('');
  const strategyOptions = STRATEGIES.filter((id) => id !== 'none').map((id) => `<option value="${id}"${id === v.strategy ? ' selected' : ''}>${esc(INFO[id].label)}</option>`).join('');

  el.innerHTML = `
    <h2>Day by day</h2>
    <div class="explorer-head">
      <div class="segmented" role="group" aria-label="Step">${unitButtons}</div>
      <div class="stepper">
        <button class="icon" data-action="step" data-dir="-1"${prev ? '' : ' disabled'} aria-label="Previous">‹</button>
        <input type="date" data-action="goto" value="${v.date}" min="${sim.days[0].date}" max="${sim.days[sim.days.length - 1].date}" aria-label="Date">
        <button class="icon" data-action="step" data-dir="1"${next ? '' : ' disabled'} aria-label="Next">›</button>
      </div>
      <label class="row small">Details for <select data-action="strategy">${strategyOptions}</select></label>
    </div>
    <h3>${esc(title)}</h3>
    ${stepTable(step)}
    ${v.unit === 'day' ? dayHtml(step) : multiDayHtml(step)}`;
}

function stepTable(step) {
  const sim = state.sim;
  const ids = ['none', 'self', 'threshold', 'smartSolar', 'smartGrid', ...(sim.results.actual ? ['actual'] : [])];
  const unit = step.unit === 'day' ? 'this day' : step.unit === 'week' ? 'this week' : 'this month';
  const rows = ids.map((id) => {
    const mask = id === 'actual' ? sim.mask : null;
    const t = strategyTotals(id, step.from, step.to, mask);
    const s = id === 'none' ? null : saving(sim.results[id], sim.results.none, step.from, step.to, mask);
    const run = id === 'none' ? null : saving(sim.results[id], sim.results.none, 0, step.to, mask);
    return `<tr class="${id === state.view.strategy ? 'highlight' : ''}"><td><span class="key" style="background:${INFO[id].color}"></span>${esc(INFO[id].label)}</td>
      <td>${money(t.netWithWear, 2)}</td><td class="${s > 0.005 ? 'pos' : s < -0.005 ? 'neg' : ''}">${s === null ? '–' : signed(s, 2)}</td>
      <td>${run === null ? '–' : signed(run, 0)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Strategy</th><th>Cost incl. wear, ${unit}</th><th>Saving vs no battery</th><th>Running saving since ${shortDate(sim.days[0].date)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function hourTip(h, r, cfg, label) {
  const share = (e) => (r.energy > 1e-6 ? (100 * e) / r.energy : 0);
  return `${String(h.hour).padStart(2, '0')}:00 · ${ACTION_LABELS[hourAction(r)]}${label ? ` (${label})` : ''}`
    + `\nBuy ${price(r.buy)} · sell ${price(r.sell)} kr./kWh`
    + `\nSolar ${num(r.pv, 2)} · house ${num(r.load, 2)} kWh`
    + `\nInto battery: solar ${num(r.pvToBat, 2)} · grid ${num(r.gridToBat, 2)}`
    + `\nOut: house ${num(r.batToLoad, 2)} · grid ${num(r.batToGrid, 2)}`
    + `\nBattery ${pct((100 * r.energy) / cfg.capacity)} – solar ${pct(share(r.solarE))}, grid ${pct(share(r.gridE))}`
    + `\nCash ${signed(r.revenue - r.cost, 2)}`;
}

function before(rows, from, cfg, id) {
  if (from > 0) return rows[from - 1];
  if (id === 'none') return { solarE: 0, gridE: 0, startE: 0, energy: 0 };
  const start = id.startsWith('smart') ? cfg.eMin + Math.round((cfg.eStart - cfg.eMin) / cfg.step) * cfg.step : cfg.eStart;
  return { solarE: 0, gridE: 0, startE: start, energy: start };
}

function groupsOfHours(list) {
  const out = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && h.hour === last.to) last.to = h.hour + 1;
    else out.push({ from: h.hour, to: h.hour + 1 });
  }
  return out.map((g) => hourRange(g.from, g.to)).join(', ');
}

// @req LAB-10 LAB-11
function dayHtml(step) {
  const sim = state.sim;
  const id = state.view.strategy;
  const cfg = sim.cfg;
  const rows = sim.results[id].slice(step.from, step.to);
  const hours = sim.hours.slice(step.from, step.to);
  const start = before(sim.results[id], step.from, cfg, id);
  const t = totals(sim.results[id], step.from, step.to, { usable: sim.usable });
  const label = INFO[id].label;
  const tips = rows.map((r, i) => hourTip(hours[i], r, cfg, label));
  const width = contentWidth($('#explorer'));
  const panels = dayPanels({ width, hours, rows, before: start, cfg, tips });

  const sold = hours.map((h, i) => ({ ...h, r: rows[i] })).filter((x) => x.r.batToGrid > 0.05);
  const bought = hours.map((h, i) => ({ ...h, r: rows[i] })).filter((x) => x.r.gridToBat > 0.05);
  const range = (list, key) => {
    const v = list.map((x) => x.r[key]);
    return v.length ? `${price(Math.min(...v))}–${price(Math.max(...v))}` : '';
  };
  const last = rows[rows.length - 1];
  const facts = `
    <div class="facts">
      <div><b>Sold from the battery</b>${sold.length ? `${energy(t.batToGrid, 1)} at ${groupsOfHours(sold)} for ${range(sold, 'sell')} kr./kWh${t.batToGrid > 0 ? ` – ${pct((100 * t.soldGrid) / t.batToGrid)} of it bought from the grid` : ''}` : 'Nothing'}</div>
      <div><b>Bought into the battery</b>${bought.length ? `${energy(t.gridToBat, 1)} at ${groupsOfHours(bought)} for ${range(bought, 'buy')} kr./kWh` : 'Nothing'}</div>
      <div><b>Battery</b>${pct((100 * start.energy) / cfg.capacity)} at midnight → ${pct((100 * last.energy) / cfg.capacity)} at the end; ${last.energy > 1e-6 ? `${pct((100 * last.solarE) / last.energy)} solar, ${pct((100 * last.gridE) / last.energy)} grid` : 'empty'}</div>
      <div><b>Solar · house and cars</b>${energy(t.pv, 1)} · ${energy(t.load, 1)}${t.curtailed > 0.05 ? ` · ${energy(t.curtailed, 1)} curtailed` : ''}</div>
    </div>`;

  const dayRows = hours.map((h, i) => ({ hour: h.hour, buy: rows[i].priced ? rows[i].buy : NaN, sell: rows[i].sell, pv: rows[i].pv, load: rows[i].load }));
  const table = rows.map((r, i) => {
    const share = (e) => (r.energy > 1e-6 ? pct((100 * e) / r.energy) : '–');
    return `<tr><td>${String(hours[i].hour).padStart(2, '0')}:00</td><td>${price(r.buy)}</td><td>${price(r.sell)}</td><td>${num(r.pv, 2)}</td><td>${num(r.load, 2)}</td>
      <td>${ACTION_LABELS[hourAction(r)]}</td><td>${num(r.pvToBat, 2)}</td><td>${num(r.gridToBat, 2)}</td><td>${num(r.batToLoad, 2)}</td><td>${num(r.batToGrid, 2)}</td>
      <td>${pct((100 * r.energy) / cfg.capacity)}</td><td>${share(r.solarE)}</td><td>${share(r.gridE)}</td><td>${signed(r.revenue - r.cost, 2)}</td></tr>`;
  }).join('');

  return `${facts}
    <p class="muted small">Charts and hour table show <b>${esc(label)}</b>. Hover or tap an hour for details.</p>
    <p class="panel-title">Prices, kr./kWh</p>
    ${legend([{ label: 'Buy (full price)', color: 'var(--c-blue)', line: true }, { label: 'Sell', color: 'var(--c-violet)', line: true }])}
    ${panels.prices}
    <p class="panel-title">Battery energy per hour, kWh (up = in, down = out)</p>
    ${legend([{ label: 'From solar', color: 'var(--c-yellow)' }, { label: 'From grid', color: 'var(--c-blue)' }, { label: 'To house', color: 'var(--c-aqua)' }, { label: 'Sold', color: 'var(--c-violet)' }])}
    ${panels.flows}
    <p class="panel-title">Battery level, % of capacity, by where the energy came from</p>
    ${legend([{ label: 'Solar', color: 'var(--c-yellow)' }, { label: 'Grid', color: 'var(--c-blue)' }, { label: 'At period start', color: 'var(--c-gray)' }])}
    ${panels.level}
    <p class="muted small">Dashed line: lowest allowed level (${pct(state.settings.battery.minSocPct)}).</p>
    ${rulesHtml(breakEven(cfg, dayRows.filter((d) => Number.isFinite(d.buy))))}
    <details class="more"><summary>Hour by hour</summary><div class="table-wrap"><table>
      <thead><tr><th>Hour</th><th>Buy</th><th>Sell</th><th>Solar</th><th>House</th><th>Battery does</th><th>Solar in</th><th>Grid in</th><th>To house</th><th>Sold</th><th>Level</th><th>Solar share</th><th>Grid share</th><th>Cash</th></tr></thead>
      <tbody>${table}</tbody></table></div><p class="hint">Prices in kr./kWh, energy in kWh. Cash = sales − purchases in the hour, before wear.</p></details>`;
}

const RULE_LABELS = {
  gridToGrid: 'Buy from the grid, sell later',
  gridToHouse: 'Buy from the grid, use in the house later',
  solarToGrid: 'Store solar, sell later',
  solarToHouse: 'Store solar, use in the house later',
};

// @req LAB-11
function rulesHtml(be) {
  if (!be) return '';
  const rows = be.rules.map((r) => {
    const nowPrice = r.id.startsWith('grid') ? r.from.buy : r.from.sell;
    const laterPrice = r.later;
    const verdict = r.pays ? `<span class="pos">Pays, ${price(r.gain)} kr./kWh to spare</span>`
      : r.to.hour <= r.from.hour ? '<span class="muted">Best hour comes first</span>'
        : `<span class="muted">Short by ${price(-r.gain)}</span>`;
    return `<tr><td>${esc(RULE_LABELS[r.id])}</td><td>${String(r.from.hour).padStart(2, '0')}:00 at ${price(nowPrice)}</td><td>${price(r.need)}</td>
      <td>${String(r.to.hour).padStart(2, '0')}:00 at ${price(laterPrice)}</td><td>${verdict}</td></tr>`;
  }).join('');
  return `<h3>When does it pay on this day?</h3>
    <div class="table-wrap"><table class="rules"><thead><tr><th>Use</th><th>Now</th><th>Later must beat</th><th>Best later</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="formula">η = ${pct(be.eta * 100, 1)} round trip · w = ${price(be.wear)} wear · m = ${price(be.margin)} margin<br>
    from grid: later &gt; (buy now + m) ÷ η + w · from solar: later &gt; sell now ÷ η + w</p>
    <p class="hint">"Now" is the day's cheapest buy hour, or the sunny hour with the lowest sell price. "Later" is the best sell hour or the dearest buy hour. The optimiser does this for every pair of hours, within the battery's power and size.</p>`;
}

// @req LAB-10
function multiDayHtml(step) {
  const sim = state.sim;
  const id = state.view.strategy;
  const width = contentWidth($('#explorer'));
  const ids = ['none', 'self', 'threshold', 'smartSolar', 'smartGrid', ...(sim.results.actual ? ['actual'] : [])];
  const bars = step.days.map((d) => {
    const s = saving(sim.results[id], sim.results.none, d.from, d.to);
    const g = totals(sim.results.smartSolar, d.from, d.to).netWithWear - totals(sim.results.smartGrid, d.from, d.to).netWithWear;
    return { label: shortDate(d.date), value: s, date: d.date, tip: `${longDate(d.date)}\n${INFO[id].label}: ${signed(s, 2)} vs no battery\nGrid charging adds ${signed(g, 2)}\nClick to open the day` };
  });
  const rows = step.days.map((d) => {
    const cells = ids.map((x) => {
      const t = totals(sim.results[x], d.from, d.to, { mask: x === 'actual' ? sim.mask : null });
      return `<td>${t.hours ? money(t.netWithWear, 2) : '–'}</td>`;
    }).join('');
    const extra = totals(sim.results.smartSolar, d.from, d.to).netWithWear - totals(sim.results.smartGrid, d.from, d.to).netWithWear;
    return `<tr class="clickable" data-action="open-day" data-date="${d.date}"><td>${weekdayName(d.date).slice(0, 3)} ${shortDate(d.date)}</td>${cells}<td>${signed(extra, 2)}</td></tr>`;
  }).join('');
  const total = (x) => money(totals(sim.results[x], step.from, step.to, { mask: x === 'actual' ? sim.mask : null }).netWithWear, 0);
  const extraTotal = totals(sim.results.smartSolar, step.from, step.to).netWithWear - totals(sim.results.smartGrid, step.from, step.to).netWithWear;
  return `<p class="panel-title">${esc(INFO[id].label)}: saving against no battery per day, kr.</p>
    ${barChart({ width, bars, color: INFO[id].color })}
    <div class="table-wrap"><table>
      <thead><tr><th>Day</th>${ids.map((x) => `<th><span class="key" style="background:${INFO[x].color}"></span>${esc(INFO[x].label)}</th>`).join('')}<th>Grid adds</th></tr></thead>
      <tbody>${rows}<tr class="highlight"><td>Total</td>${ids.map((x) => `<td>${total(x)}</td>`).join('')}<td>${signed(extraTotal, 0)}</td></tr></tbody>
    </table></div><p class="hint">Cost incl. wear per day (− = income). Select a day to open it. A single day can look worse with a battery: energy bought or kept one day is often sold the next, so judge weeks and months.</p>`;
}

function methodHtml() {
  return `<details class="more"><summary>How the lab calculates</summary><div class="small">
    <p><b>Prices.</b> Every hour uses the price that applied then for the chosen grid company, from stromligning.dk: spot, Energinet's system and net tariffs, the grid company's time-of-use tariff and the electricity tax of that date, plus the supplier markup, times 1,25 VAT. Selling gets the spot price minus production tariffs and the supplier's fee, without VAT.</p>
    <p><b>Solar.</b> Open-Meteo's historical irradiance on the panel plane × size × performance ratio, corrected for cell temperature. Imported production replaces it.</p>
    <p><b>Consumption.</b> A typical Danish daily and seasonal profile scaled to the yearly kWh, a heat pump following degree-hours below 17 °C, and cars charged in the cheapest hours of their overnight window. Imported consumption replaces it.</p>
    <p><b>Optimiser.</b> Dynamic programming over the battery level in ${price(state.settings.strategy.stepKwh)} kWh steps. Every day at 13:00, when tomorrow's prices are published, it plans the hours until tomorrow midnight and carries out the next 24 hours. It minimises purchases − sales + wear + margin on grid purchases, and values energy left at the end at the window's cheapest buy price. "Smart, solar only" may not let grid power into the battery; "Smart, solar + grid" may.</p>
    <p><b>Optimistic on purpose.</b> Inside a planning window the solar and consumption are taken as known; a real controller works from forecasts and will do somewhat worse. Hourly resolution: since October 2025 the market trades quarter-hours, which a controller could use for a little extra. No standby losses of the battery or inverter.</p>
    <p><b>Left out.</b> Subscriptions and fixed fees (the same in every strategy), payments for flexibility or frequency services, and any change in how the grid company bills a battery.</p>
  </div></details>`;
}

// ---------------------------------------------------------------- events

function onChange(event) {
  const el = event.target;
  if (el.dataset.path) {
    const path = el.dataset.path;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.number !== undefined) value = Number(value);
    const next = structuredClone(state.settings);
    setPath(next, path, value);
    if (path === 'prices.area') {
      const inArea = state.companies.filter((c) => c.priceArea === value);
      if (inArea.length && !inArea.some((c) => c.id === next.prices.gridCompany)) next.prices.gridCompany = inArea[0].id;
    }
    state.settings = normalizeSettings(next);
    save('lab.settings', state.settings);
    if (el.type !== 'checkbox' && el.tagName === 'INPUT') el.value = inputValue(getPath(state.settings, path));
    if (path === 'prices.area') rerenderSettings();
    updateSummaries();
    refreshHints();
    scheduleCalculate();
    return;
  }
  if (el.dataset.wear) {
    const v = Number(String(el.value).replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) state.wearCalc[el.dataset.wear] = v;
    el.value = inputValue(state.wearCalc[el.dataset.wear]);
    refreshHints();
    return;
  }
  if (el.dataset.period) {
    const next = { ...state.period, [el.dataset.period]: el.value };
    const valid = validPeriod(next);
    if (valid) {
      state.period = valid;
      save('lab.period', state.period);
    }
    syncPeriodInputs();
    return;
  }
  if (el.dataset.import) {
    const file = state.imports[Number(el.dataset.file)];
    if (!file) return;
    const kind = el.dataset.import;
    if (kind === 'time') file.timeColumn = Number(el.value);
    else if (kind === 'intervalEnd') file.intervalEnd = el.checked;
    else {
      const col = file.columns.find((c) => c.index === Number(el.dataset.col));
      if (kind === 'role') {
        col.role = el.value;
        if (col.role === 'soc') col.unit = '%';
      } else if (kind === 'unit') col.unit = el.value;
      else if (kind === 'invert') col.invert = el.checked;
    }
    refreshImport();
    scheduleCalculate(150);
    return;
  }
  const action = el.dataset.action;
  if (action === 'import-files') importFiles(el.files);
  else if (action === 'use-imported') {
    state.useImported = el.checked;
    scheduleCalculate(50);
  } else if (action === 'strategy') {
    state.view.strategy = el.value;
    renderExplorer();
  } else if (action === 'goto' && el.value) {
    state.view.date = el.value;
    renderExplorer();
  }
}

function syncPeriodInputs() {
  for (const key of ['from', 'to']) {
    const input = document.querySelector(`[data-period="${key}"]`);
    if (input) input.value = state.period[key];
  }
}

async function importFiles(fileList) {
  for (const file of fileList ?? []) {
    try {
      const text = await readFile(file);
      const described = describeCsv(file.name, parseCsv(text));
      if (described.timeColumn < 0) throw new Error('no column with dates and times was found');
      state.imports.push(described);
    } catch (err) {
      setStatus('error', `${file.name}: ${err.message}`);
    }
  }
  refreshImport();
  updateSummaries();
  if (state.sim || state.data.prices) scheduleCalculate(50);
}

function onClick(event) {
  const el = event.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
  const action = el.dataset.action;
  if (action === 'theme') {
    const light = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    save('lab.theme', light ? 'light' : 'dark');
    el.textContent = light ? '☾ Dark' : '☀ Light';
    el.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
  } else if (action === 'calculate') {
    calculate();
  } else if (action === 'preset') {
    const to = yesterday();
    let from;
    if (el.dataset.days) from = addDays(to, -(Number(el.dataset.days) - 1));
    else if (el.dataset.year === 'this') from = `${to.slice(0, 4)}-01-01`;
    else {
      const year = Number(to.slice(0, 4)) - 1;
      state.period = validPeriod({ from: `${year}-01-01`, to: `${year}-12-31` });
    }
    if (from) state.period = validPeriod({ from, to });
    save('lab.period', state.period);
    syncPeriodInputs();
    calculate();
  } else if (action === 'reset') {
    state.settings = defaultSettings();
    save('lab.settings', state.settings);
    rerenderSettings();
    scheduleCalculate(50);
  } else if (action === 'tax-2028' || action === 'tax-actual') {
    state.settings = normalizeSettings({ ...state.settings, prices: { ...state.settings.prices, taxOverride: action === 'tax-2028' ? TAX_2028 : null } });
    save('lab.settings', state.settings);
    rerenderSettings();
    scheduleCalculate(50);
  } else if (action === 'use-wear') {
    state.settings = normalizeSettings({ ...state.settings, strategy: { ...state.settings.strategy, wear: Math.round(wearSuggestion().value * 100) / 100 } });
    save('lab.settings', state.settings);
    rerenderSettings();
    scheduleCalculate(50);
  } else if (action === 'import-remove') {
    state.imports.splice(Number(el.dataset.file), 1);
    refreshImport();
    updateSummaries();
    scheduleCalculate(50);
  } else if (action === 'import-period') {
    const range = importedRange();
    if (range) {
      state.period = validPeriod({ from: range.first, to: range.last }) ?? state.period;
      save('lab.period', state.period);
      syncPeriodInputs();
      calculate();
    }
  } else if (action === 'unit') {
    state.view.unit = el.dataset.unit;
    renderExplorer();
  } else if (action === 'step') {
    const date = shiftStep(state.sim.days, state.view.unit, state.view.date, Number(el.dataset.dir));
    if (date) {
      state.view.date = date;
      renderExplorer();
    }
  } else if (action === 'open-day') {
    state.view.unit = 'day';
    state.view.date = el.dataset.date;
    renderExplorer();
    $('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Tooltip for every element with data-tip (chart hit areas).
function onPointer(event) {
  const tip = $('#tip');
  const target = event.target.closest?.('[data-tip]');
  if (!target) {
    tip.style.display = 'none';
    return;
  }
  tip.textContent = target.dataset.tip;
  tip.style.display = 'block';
  const pad = 14;
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = tip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > vw - 8) x = Math.max(8, event.clientX - rect.width - pad);
  if (y + rect.height > vh - 8) y = Math.max(8, event.clientY - rect.height - pad);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

let resizeTimer = 0;
let lastWidth = window.innerWidth;
function onResize() {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderResults();
    renderExplorer();
  }, 200);
}

async function start() {
  renderPage();
  const lab = $('#lab');
  lab.addEventListener('change', onChange);
  lab.addEventListener('click', onClick);
  document.addEventListener('pointermove', onPointer);
  document.addEventListener('pointerdown', onPointer);
  window.addEventListener('resize', onResize);
  getGridCompanies().then((list) => {
    state.companies = list;
    rerenderSettings();
  }).catch(() => {});
  calculate();
}

start();
