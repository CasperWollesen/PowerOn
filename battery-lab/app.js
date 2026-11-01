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
import { STRATEGIES, batteryConfig, runStrategy, hourAction, startEnergy } from './optimizer.js';
import {
  totals, dayRanges, stepRange, shiftStep, cumulativeSaving, saving, breakEven, perYear, dayStory,
  compareRuns, investment, paybackYears, isoWeek,
} from './summary.js';
import { parseCsv, describeCsv, toHourly, completeHours, coverage, actualRows, ROLES, UNITS } from './import.js';
import { loadPrices, loadWeather, getGridCompanies } from './data.js';
import { lineChart, barChart, dayPanels, levelLines, legend } from './charts.js';

const MIN_DATE = '2023-01-01';
const MAX_DAYS = 1100;
const TAX_2028 = 0.76;

const INFO = {
  nothing: { label: 'No solar, no battery', color: 'var(--c-gray)', text: 'Everything is bought from the grid. The reference for a new installation.' },
  none: { label: 'Solar, no battery', color: 'var(--c-aqua)', text: 'Solar covers the house; the rest is sold.' },
  self: { label: 'Solar self-use', color: 'var(--c-yellow)', text: 'Stores solar surplus and covers the house. Never sells from the battery, never buys into it. What a hybrid inverter does out of the box.' },
  threshold: { label: 'Sell above threshold', color: 'var(--c-green)', text: 'Self-use, plus selling from the battery at full power whenever the sell price is at or above the threshold.' },
  manual: { label: 'Today (manual)', color: 'var(--c-orange)', text: 'Stored solar is sold at the best hours; the battery is only topped up from the grid when the full price is at or below the "nearly free" limit. Modelled with perfect timing, so it is a generous picture of manual control.' },
  smartSolar: { label: 'Smart, solar only', color: 'var(--c-violet)', text: 'Plans charging and selling every day at 13:00 when tomorrow\'s prices are out, but never lets grid power into the battery.' },
  smartGrid: { label: 'Smart software', color: 'var(--c-blue)', text: 'Plans every day at 13:00 when tomorrow\'s prices are out, and also buys power into the battery whenever that pays after losses, wear and margin.' },
  actual: { label: 'Actual (imported)', color: 'var(--c-magenta)', text: 'What the imported meter data says was bought and sold, priced the same way.' },
};
const BUYER_LABELS = { none: 'Solar only', self: 'Solar + battery, inverter self-use', smartGrid: 'Solar + battery, smart software' };
const OWNER_ALL = ['self', 'threshold', 'manual', 'smartSolar', 'smartGrid'];
const BUYER = ['nothing', 'none', 'self', 'smartGrid'];
const ROLE_LABELS = {
  ignore: '–', pv: 'Solar production', load: 'House consumption', import: 'Grid import', export: 'Grid export',
  gridNet: 'Grid net (+ import)', charge: 'Battery charge', discharge: 'Battery discharge',
  batteryNet: 'Battery net (+ discharge)', soc: 'State of charge',
};
const ACTION_LABELS = { sell: 'Sell', buy: 'Buy', store: 'Store solar', cover: 'Cover house', idle: '–' };
const PART_LABELS = {
  panels: 'Panels, rails and cables (mounted yourself)', inverter: 'Hybrid inverter', battery: 'Battery',
  electrician: 'Authorised electrician', other: 'Other parts',
};

const state = {
  settings: normalizeSettings(load('lab.settings')),
  period: validPeriod(load('lab.period')) ?? defaultPeriod(),
  mode: load('lab.mode') === 'buyer' ? 'buyer' : 'owner',
  view: { unit: 'day', date: null, strategy: 'smartGrid' },
  status: { kind: 'idle', text: '' },
  data: { pricesKey: '', prices: null, weatherKey: '', weather: null },
  sim: null,
  imports: [],
  useImported: true,
  companies: [],
  wearCalc: { price: 60000, cycles: 3000 },
  generation: 0,
};

const $ = (selector) => document.querySelector(selector);

function label(id) {
  return state.mode === 'buyer' && BUYER_LABELS[id] ? BUYER_LABELS[id] : INFO[id].label;
}

function key(id) {
  return `<span class="key" style="background:${INFO[id].color}"></span>`;
}

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

function years(v) {
  return Number.isFinite(v) ? `${num(v, 1)} years` : 'never';
}

function hh(hour) {
  return String(hour).padStart(2, '0');
}

function hourRange(from, to) {
  return `${hh(from)}–${hh(to)}`;
}

function priceRange(list) {
  if (!list.length) return '';
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  return Math.abs(hi - lo) < 0.005 ? price(lo) : `${price(lo)}–${price(hi)}`;
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

function periodText(sim) {
  const first = sim.days[0].date;
  const last = sim.days[sim.days.length - 1].date;
  return `${shortDate(first)}/${first.slice(0, 4)} – ${shortDate(last)}/${last.slice(0, 4)}`;
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

function field(path, text, { unit = '', assumed = false } = {}) {
  return `<label class="field"><span class="${assumed ? 'assumed' : ''}">${esc(text)}</span>`
    + `<span class="control"><input type="text" inputmode="decimal" autocomplete="off" data-path="${path}" value="${esc(inputValue(getPath(state.settings, path)))}">`
    + `${unit ? `<em>${esc(unit)}</em>` : ''}</span></label>`;
}

function check(path, text) {
  return `<label class="field check"><input type="checkbox" data-path="${path}"${getPath(state.settings, path) ? ' checked' : ''}><span>${esc(text)}</span></label>`;
}

function select(path, text, options) {
  const value = getPath(state.settings, path);
  return `<label class="field"><span>${esc(text)}</span><select data-path="${path}">${options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}

function selectNumber(path, text, options) {
  const value = getPath(state.settings, path);
  return `<label class="field"><span>${esc(text)}</span><select data-path="${path}" data-number>${options.map(([v, t]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
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
  const inv = investment(s);
  return {
    battery: `${num(b.capacityKwh, 0)} kWh · kept ${num(b.minSocPct, 0)}–${num(b.maxSocPct, 0)} % · ${num(b.chargeKw, 1).replace(/,0$/, '')} kW in / ${num(b.dischargeKw, 1).replace(/,0$/, '')} kW out · ${num(b.chargeEff, 0)} % × ${num(b.dischargeEff, 0)} %`,
    solar: arrays.length ? arrays.map((a) => `${num(a.kwp, 1).replace(/,0$/, '')} kWp ${azimuthName(a.azimuth)} ${num(a.tilt, 0)}°`).join(' + ') + ` · PR ${num(s.solar.performanceRatio, 0)} %` : 'No solar',
    house: `House ${num(s.house.annualKwh, 0)} kWh/yr · heat pump ${num(s.house.heatPumpKwh, 0)} kWh/yr · cars ${carText || 'none'}${carText ? ' kWh/day' : ''}`,
    prices: `${companyName(s.prices.gridCompany)} (${s.prices.area}) · markup ${price(s.prices.buyMarkup)} · sell fee ${price(s.prices.sellFee)} · tax ${s.prices.taxOverride === null ? 'as charged' : `${price(s.prices.taxOverride)} kr./kWh`} · export ${num(s.grid.exportKw, 0)} kW`,
    strategy: `Today tops up at ≤ ${price(s.strategy.manualBuyBelow)} kr./kWh · wear ${price(s.strategy.wear)} · margin ${price(s.strategy.gridMargin)} · ${s.strategy.planner === 'dayAhead' ? 'day-ahead planner' : 'hindsight planner'}`,
    invest: `${money(inv.withBattery)} for ${num(inv.kwp, 1).replace(/,0$/, '')} kWp and ${num(b.capacityKwh, 0)} kWh · solar only ${money(inv.solarOnly)}`,
    data: state.imports.length ? `${state.imports.length} file${state.imports.length > 1 ? 's' : ''} loaded${state.sim?.coverage ? ` · ${num(state.sim.coverage.hours, 0)} hours in the period` : ''}` : 'No files loaded – everything is modelled',
  };
}

function updateSummaries() {
  for (const [name, text] of Object.entries(groupSummaries())) {
    const el = document.querySelector(`[data-sum="${name}"]`);
    if (el) el.textContent = text;
  }
}

function group(name, title, body, { assumed = false } = {}) {
  return `<details class="group" data-group="${name}"><summary><span class="title${assumed ? ' assumed' : ''}">${esc(title)}</span>`
    + `<span class="sum" data-sum="${name}">${esc(groupSummaries()[name])}</span></summary><div class="body">${body}</div></details>`;
}

// @req LAB-13 LAB-16
function settingsHtml() {
  const s = state.settings;
  const companies = state.companies.filter((c) => c.priceArea === s.prices.area);
  const companyOptions = companies.length ? companies.map((c) => [c.id, c.name]) : [[s.prices.gridCompany, companyName(s.prices.gridCompany)]];
  const hours = Array.from({ length: 24 }, (_, h) => [h, `${hh(h)}:00`]);
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
  const invest = state.mode === 'buyer' ? group('invest', 'Purchase prices', `<div class="fields">
      ${field('invest.panelPerKwp', 'Panels, rails and cables', { unit: 'kr. per kWp', assumed: true })}
      ${field('invest.inverter', 'Hybrid inverter', { unit: 'kr.', assumed: true })}
      ${field('invest.batteryPerKwh', 'Battery', { unit: 'kr. per kWh', assumed: true })}
      ${field('invest.electrician', 'Authorised electrician', { unit: 'kr.', assumed: true })}
      ${field('invest.other', 'Other parts', { unit: 'kr.', assumed: true })}
    </div>
    <p class="hint">Prices incl. VAT, rough 2026 estimates for parts bought by the owner – replace them with real quotes. You may mount rails and panels yourself; connecting panels, inverter and battery to the house and the grid must be done by an authorised electrician, who also registers the installation with the grid company. Home batteries are a grey zone in the rules, so count on the electrician there too.</p>`, { assumed: true }) : '';
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
    </div><p class="hint">Efficiencies are AC to battery and battery to AC. 95 % × 95 % ≈ 90 % round trip, typical for a lithium battery on a hybrid inverter.</p>`)}
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
    ${group('strategy', 'How it is run, wear and margin', `<div class="fields">
      ${field('strategy.manualBuyBelow', 'Today: tops up from the grid at or below (full price)', { unit: 'kr./kWh', assumed: true })}
      ${field('strategy.wear', 'Battery wear per kWh delivered', { unit: 'kr./kWh' })}
      ${field('strategy.gridMargin', 'Extra margin before buying to store', { unit: 'kr./kWh' })}
      ${field('strategy.sellThreshold', 'Threshold for "Sell above threshold"', { unit: 'kr./kWh' })}
      ${select('strategy.planner', 'Planner', [['dayAhead', 'Day-ahead (realistic)'], ['hindsight', 'Hindsight (upper bound)']])}
      ${field('strategy.stepKwh', 'Optimiser step', { unit: 'kWh' })}
      ${check('strategy.curtail', 'Curtail solar when the sell price is negative')}
    </div>
    <p class="hint">"Today" sells stored solar at the best hours and only buys into the battery when power is nearly free, like a windy night. The lab gives it perfect timing, which no person manages every day.</p>
    <p class="hint" data-rule>${ruleOfThumb()}</p>
    <p class="sub">Wear calculator</p>
    <div class="fields">
      <label class="field"><span>Replacement price of the battery</span><span class="control"><input type="text" inputmode="decimal" data-wear="price" value="${esc(inputValue(state.wearCalc.price))}"><em>kr.</em></span></label>
      <label class="field"><span>Cycle life</span><span class="control"><input type="text" inputmode="decimal" data-wear="cycles" value="${esc(inputValue(state.wearCalc.cycles))}"><em>cycles</em></span></label>
    </div>
    <p class="hint" data-wear-result>${wear.text}</p>
    <div class="row"><button data-action="use-wear" data-wear-use>Use ${price(wear.value)} kr./kWh</button></div>
    <p class="hint">Wear is real money and counted in every total. The margin is only a hurdle for buying from the grid: it is not paid to anyone, it just stops the battery from cycling for a few øre. Batteries also age with time, so if the battery would reach its calendar age before its cycle life, extra cycles cost less than the calculator says. Second-life car batteries (often NMC) usually have fewer cycles left than new LFP home batteries, but cost much less.</p>`)}
    ${invest}
    ${group('data', 'Your own measurements', `<div id="import-body">${importHtml()}</div>`)}`;
}

function solarHint() {
  const sim = state.sim;
  const yieldText = sim ? ` Modelled yield in this period: <b>${num(sim.yieldPerKwp, 0)} kWh/kWp</b>, ${energy(sim.pvTotal)} in total. Compare with the inverter's own figure and adjust size or performance ratio until they match.` : '';
  return `Estimated from Open-Meteo's irradiance on the panel plane for ${esc(state.settings.location.label)}.${yieldText}`;
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
  return `<p class="hint">Load CSV exports from the inverter (e.g. Fronius Solar.web: production, consumption, feed-in, purchase, battery charge/discharge, state of charge) or from Eloverblik (hourly import and export meter readings). Several files can be combined. With grid import and export, an <b>Actual</b> row shows what really happened next to what smart software would have done. <b>The files stay in this browser tab</b>: they are not stored and not sent anywhere, and a reload forgets them.</p>
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
    setStatus('calculating', 'Calculating the strategies…');
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

// @req LAB-06 LAB-09 LAB-12
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
  const usable = cfg.eMax - cfg.eMin;

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

  // The same hours with the electricity tax from 2028, totals only.
  let alt = null;
  if (s.prices.taxOverride === null) {
    const later = priceSeries(hours, state.data.prices.buy, state.data.prices.sell, { ...s.prices, taxOverride: TAX_2028 });
    const inpLater = { ...inp, buy: later.buy };
    alt = {};
    for (const id of ['nothing', 'none', 'self', 'manual', 'smartGrid']) {
      alt[id] = totals(runStrategy(inpLater, cfg, id).rows, 0, hours.length, { usable });
    }
  }
  const kwp = s.solar.arrays.reduce((a, b) => a + b.kwp, 0);
  const pvTotal = pv.reduce((a, b) => a + b, 0);
  return {
    hours, inp, cfg, prices, results, mask, alt, coverage: cov, usable,
    days: dayRanges(hours),
    solarMissing: solar.missing,
    pvTotal,
    yieldPerKwp: kwp > 0 ? pvTotal / kwp : 0,
    loadTotal: load.reduce((a, b) => a + b, 0),
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

// @req LAB-15
function renderPage() {
  const { from, to } = state.period;
  const light = document.documentElement.dataset.theme === 'light';
  const owner = state.mode === 'owner';
  const intro = owner
    ? 'The installation is already there. What would smart control software earn on top of running it by hand – selling stored solar at the best hours and topping up from the grid only when power is nearly free? Step through the period day by day and see where the difference comes from.'
    : 'For a household with no solar panels and no battery yet: what would a setup cost, save and pay back on real prices? Panels and rails mounted by the owner, all electrical work by an authorised electrician.';
  $('#lab').innerHTML = `
    <header class="topbar">
      <div>
        <h1>Battery Lab</h1>
        <p>${intro}</p>
      </div>
      <button class="icon" data-action="theme" aria-label="Switch to ${light ? 'dark' : 'light'} theme">${light ? '☾ Dark' : '☀ Light'}</button>
    </header>
    <div class="mode segmented" role="group" aria-label="View">
      <button data-action="mode" data-mode="owner" aria-pressed="${owner}">Existing installation</button>
      <button data-action="mode" data-mode="buyer" aria-pressed="${!owner}">New installation</button>
    </div>
    <section class="card" id="setup">
      <h2>Setup</h2>
      <p class="hint">The defaults describe a reference household near Horsens: a 60 kWh battery built from an electric car's battery, kept between 20 % and 100 %, a 10 kW inverter, solar panels, a house and two electric cars. <span class="flag">⚑</span> marks guesses – replace them with the real numbers.</p>
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
  for (const name of open) document.querySelector(`details.group[data-group="${name}"]`)?.setAttribute('open', '');
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

function renderResults() {
  const el = $('#results');
  if (!el) return;
  if (!state.sim) {
    el.innerHTML = '<h2>Result</h2><p class="muted">Pick a period and press Calculate. A year takes a few seconds the first time; completed months are cached after that.</p>';
    return;
  }
  el.innerHTML = state.mode === 'owner' ? ownerResults(contentWidth(el)) : buyerResults(contentWidth(el));
}

function notices(sim) {
  const out = [];
  if (sim.days.length < 360) out.push(`The period is ${num(sim.days.length, 0)} days. Per-year figures are scaled from it and depend on the season; use 12 months for a fair year.`);
  if (sim.prices.missing) out.push(`${num(sim.prices.missing, 0)} hours have no price; the battery idles in them and they are left out of every total.`);
  if (sim.prices.sellFromSpot) out.push(`${num(sim.prices.sellFromSpot, 0)} hours have no production price; the spot price is used as sell price there.`);
  if (sim.solarMissing) out.push(`${num(sim.solarMissing, 0)} hours have no irradiance data; solar counts as zero there.`);
  if (state.settings.prices.taxOverride !== null) out.push(`Electricity tax overridden to ${price(state.settings.prices.taxOverride)} kr./kWh excl. VAT in every hour.`);
  if (state.settings.strategy.planner === 'hindsight') out.push('Hindsight planner: one plan for the whole period with every price known. This is an upper bound, not something a controller can do.');
  return out.map((t) => `<p class="notice small">${esc(t)}</p>`).join('');
}

function tile(title, value, note) {
  return `<div class="tile"><div class="label">${title}</div><div class="value num">${value}</div><div class="note">${note}</div></div>`;
}

// @req LAB-09 LAB-15
function ownerResults(width) {
  const sim = state.sim;
  const n = sim.hours.length;
  const days = sim.days.length;
  const T = Object.fromEntries([...OWNER_ALL, ...(sim.results.actual ? ['actual'] : [])].map((id) => [id, strategyTotals(id, 0, n)]));
  const extra = T.manual.netWithWear - T.smartGrid.netWithWear;
  const later = sim.alt ? perYear(sim.alt.manual.netWithWear - sim.alt.smartGrid.netWithWear, days) : null;
  const cmp = compareRuns(sim.results.manual, sim.results.smartGrid, 0, n);
  const m = cmp.base;
  const g = cmp.other;
  const buyingDays = sim.days.filter((d) => totals(sim.results.smartGrid, d.from, d.to).gridToBat > 0.05).length;
  const limit = state.settings.strategy.manualBuyBelow;

  let actualText = '';
  const series = [{ label: 'Smart software over today', color: INFO.smartGrid.color, values: cumulativeSaving(sim.days, sim.results.smartGrid, sim.results.manual).map((p) => p.value) }];
  if (T.actual) {
    const vsActual = saving(sim.results.smartGrid, sim.results.actual, 0, n, sim.mask);
    actualText = `<p class="notice small">Against the imported measurements (${num(T.actual.hours, 0)} hours with grid data): smart software would have earned <b>${signed(vsActual)}</b> more than what really happened${T.actual.hours >= 24 * 28 ? `, about ${signed(perYear(vsActual, T.actual.hours / 24))} per year` : ''}. Over a few days the battery's level at the start decides most of the difference; compare whole weeks or months.</p>`;
    series.push({ label: 'Smart software over actual', color: INFO.actual.color, values: cumulativeSaving(sim.days, sim.results.smartGrid, sim.results.actual, sim.mask).map((p) => p.value) });
  }
  const labels = sim.days.map((d) => shortDate(d.date));
  const tips = sim.days.map((d, i) => `${longDate(d.date)}\nSince ${shortDate(sim.days[0].date)}:\n${series.map((s) => `${s.label}: ${signed(s.values[i])}`).join('\n')}`);

  const row = (id) => {
    const t = T[id];
    const vsToday = T.manual.netWithWear - t.netWithWear;
    return `<tr class="${id === 'smartGrid' ? 'highlight' : ''}"><td>${key(id)}${esc(label(id))}</td><td>${money(t.netWithWear)}</td>
      <td class="${vsToday > 0.5 ? 'pos' : vsToday < -0.5 ? 'neg' : ''}">${id === 'manual' ? '–' : signed(vsToday)}</td>
      <td>${energy(t.gridToBat)}</td><td>${energy(t.batToGrid)}</td><td>${num(t.cyclesPerYear, 0)}</td><td>${money(t.wear)}</td></tr>`;
  };
  const head = '<thead><tr><th>Strategy</th><th>Cost incl. wear (− = income)</th><th>Compared with today</th><th>Bought to battery</th><th>Sold from battery</th><th>Cycles/yr</th><th>Wear</th></tr></thead>';

  return `
    <h2>Result · ${periodText(sim)}</h2>
    <div class="hero"><span class="value num">${signed(perYear(extra, days))}</span>
      <span class="label">per year: what smart software would earn on top of today's manual way – ${signed(extra)} over these ${num(days, 0)} days.</span></div>
    ${later !== null ? `<p>With the electricity tax from 2028 (≈ ${price(TAX_2028)} kr./kWh) the extra is about <b>${signed(later)}</b> per year: buying from the grid to sell again mostly stops paying, moving the house's own use to cheap hours still does.</p>` : ''}
    <p class="muted small">"Today" is modelled generously: perfect timing for selling, and topping up from the grid at or below ${price(limit)} kr./kWh. Real manual control misses days, so the true extra is likely higher. Imported measurements give the real comparison.</p>
    ${actualText}
    ${notices(sim)}
    <div class="tiles">
      ${tile('Bought into the battery', `${energy(m.gridToBat)} → ${energy(g.gridToBat)}`, `today → smart · smart buys on ${num(buyingDays, 0)} of ${num(days, 0)} days${g.avgBuy !== null ? `, on average at ${price(g.avgBuy)} kr./kWh` : ''}`)}
      ${tile('Sold from the battery', `${energy(m.batToGrid)} → ${energy(g.batToGrid)}`, `${money(m.soldRevenue)} → ${money(g.soldRevenue)} · ${pct(g.batToGrid > 0 ? (100 * g.soldGrid) / g.batToGrid : 0)} of smart's sales were bought from the grid`)}
      ${tile('Battery cycles per year', `${num(T.manual.cyclesPerYear, 0)} → ${num(T.smartGrid.cyclesPerYear, 0)}`, `extra wear ${money(perYear(g.wear - m.wear, days))} per year, already counted`)}
      ${tile('Battery covers the house', `${energy(m.batToLoad)} → ${energy(g.batToLoad)}`, 'kWh the house did not have to buy')}
    </div>
    <h3>Smart software over today, day by day</h3>
    ${series.length > 1 ? legend(series.map((s) => ({ label: s.label, color: s.color, line: true }))) : ''}
    ${lineChart({ width, series, labels, tips })}
    <h3>Today and smart software</h3>
    <div class="table-wrap"><table>${head}<tbody>${row('manual')}${row('smartGrid')}</tbody></table></div>
    <details class="more"><summary>Other ways to run the same battery</summary>
      <div class="table-wrap"><table>${head}<tbody>${OWNER_ALL.map(row).join('')}</tbody></table></div>
      <ul class="small">${OWNER_ALL.map((id) => `<li><b>${esc(label(id))}</b> – ${esc(INFO[id].text)}</li>`).join('')}</ul>
    </details>`;
}

// @req LAB-09 LAB-15 LAB-16
function buyerResults(width) {
  const sim = state.sim;
  const n = sim.hours.length;
  const days = sim.days.length;
  const inv = investment(state.settings);
  const T = Object.fromEntries(BUYER.map((id) => [id, strategyTotals(id, 0, n)]));
  const invests = { nothing: 0, none: inv.solarOnly, self: inv.withBattery, smartGrid: inv.withBattery };
  const line = (id) => {
    const save = perYear(T.nothing.net - T[id].netWithWear, days);
    const saveLater = sim.alt ? perYear(sim.alt.nothing.net - sim.alt[id].netWithWear, days) : null;
    return {
      id, cost: perYear(T[id].netWithWear, days), save, saveLater, invest: invests[id],
      payback: paybackYears(invests[id], save), paybackLater: saveLater === null ? null : paybackYears(invests[id], saveLater),
    };
  };
  const lines = BUYER.map(line);
  const best = lines[3];
  const solarOnly = lines[1];
  const batteryCost = inv.withBattery - inv.solarOnly;
  const batterySave = best.save - solarOnly.save;
  const series = ['none', 'self', 'smartGrid'].map((id) => ({
    label: label(id), color: INFO[id].color,
    values: cumulativeSaving(sim.days, sim.results[id], sim.results.nothing).map((p) => p.value),
  }));
  const labels = sim.days.map((d) => shortDate(d.date));
  const tips = sim.days.map((d, i) => `${longDate(d.date)}\nSaved since ${shortDate(sim.days[0].date)}:\n${series.map((s) => `${s.label}: ${money(s.values[i])}`).join('\n')}`);
  const rows = lines.map((l) => `<tr class="${l.id === 'smartGrid' ? 'highlight' : ''}"><td>${key(l.id)}${esc(label(l.id))}</td>
    <td>${money(l.cost)}</td><td>${l.id === 'nothing' ? '–' : money(l.save)}</td><td>${l.id === 'nothing' ? '–' : money(l.invest)}</td>
    <td>${l.id === 'nothing' ? '–' : years(l.payback)}</td><td>${l.id === 'nothing' || l.saveLater === null ? '–' : money(l.saveLater)}</td>
    <td>${l.id === 'nothing' || l.paybackLater === null ? '–' : years(l.paybackLater)}</td></tr>`).join('');
  const parts = inv.parts.map((p) => `<tr><td>${esc(PART_LABELS[p.id])}</td><td>${money(p.amount)}</td><td>${p.solar ? 'yes' : '–'}</td></tr>`).join('');

  return `
    <h2>Result · ${periodText(sim)}</h2>
    <div class="hero"><span class="value num">${years(best.payback)}</span>
      <span class="label">payback for solar + battery with smart software: ${money(inv.withBattery)} for ${num(inv.kwp, 1).replace(/,0$/, '')} kWp and ${num(state.settings.battery.capacityKwh, 0)} kWh, saving ${money(best.save)} a year${best.saveLater !== null ? ` (${money(best.saveLater)} with the 2028 tax)` : ''}.</span></div>
    <p>Solar alone pays back in <b>${years(solarOnly.payback)}</b>. The battery on its own costs ${money(batteryCost)} and adds ${money(batterySave)} a year with smart software, which is <b>${years(paybackYears(batteryCost, batterySave))}</b> for that part.</p>
    ${notices(sim)}
    <h3>What each setup costs and saves per year</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Setup</th><th>Electricity per year</th><th>Saving per year</th><th>Investment</th><th>Payback</th><th>Saving, 2028 tax</th><th>Payback, 2028 tax</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="hint">Saving is against buying everything from the grid, including battery wear. Simple payback: investment ÷ saving per year, no interest and no price changes. Panels last 25+ years, inverters and batteries usually 10–15. From 2028 the electricity tax is back, so every kWh of own solar used in the house saves more.</p>
    <details class="more"><summary>The investment, part by part</summary>
      <div class="table-wrap"><table><thead><tr><th>Part</th><th>Amount incl. VAT</th><th>Also for solar only</th></tr></thead><tbody>${parts}
        <tr class="highlight"><td>Solar + battery</td><td>${money(inv.withBattery)}</td><td>${money(inv.solarOnly)}</td></tr></tbody></table></div>
      <p class="hint">Change the prices under Setup → Purchase prices. The owner mounts rails and panels; an authorised electrician connects everything and registers it with the grid company.</p>
    </details>
    <h3>Saved against no solar and no battery, day by day</h3>
    ${legend(series.map((s) => ({ label: s.label, color: s.color, line: true })))}
    ${lineChart({ width, series, labels, tips })}`;
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
  const owner = state.mode === 'owner';
  if (!v.date || !sim.days.some((d) => d.date === v.date)) v.date = sim.days[sim.days.length - 1].date;
  if (!owner && !['none', 'self', 'smartGrid'].includes(v.strategy)) v.strategy = 'smartGrid';
  const step = stepRange(sim.days, v.unit, v.date);
  const prev = shiftStep(sim.days, v.unit, v.date, -1);
  const next = shiftStep(sim.days, v.unit, v.date, 1);
  const title = v.unit === 'day' ? longDate(step.first)
    : v.unit === 'week' ? `Week ${isoWeek(step.first)} · ${shortDate(step.first)}–${shortDate(step.last)} ${step.last.slice(0, 4)}`
      : `${monthName(step.first)}${step.days.length < 28 ? ` (${shortDate(step.first)}–${shortDate(step.last)} in the period)` : ''}`;
  const unitButtons = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([u, t]) => `<button data-action="unit" data-unit="${u}" aria-pressed="${v.unit === u}">${t}</button>`).join('');
  const picker = owner ? '' : `<label class="row small">Details for <select data-action="strategy">${['none', 'self', 'smartGrid'].map((id) => `<option value="${id}"${id === v.strategy ? ' selected' : ''}>${esc(label(id))}</option>`).join('')}</select></label>`;

  el.innerHTML = `
    <h2>Day by day</h2>
    <div class="explorer-head">
      <div class="segmented" role="group" aria-label="Step">${unitButtons}</div>
      <div class="stepper">
        <button class="icon" data-action="step" data-dir="-1"${prev ? '' : ' disabled'} aria-label="Previous">‹</button>
        <input type="date" data-action="goto" value="${v.date}" min="${sim.days[0].date}" max="${sim.days[sim.days.length - 1].date}" aria-label="Date">
        <button class="icon" data-action="step" data-dir="1"${next ? '' : ' disabled'} aria-label="Next">›</button>
      </div>
      ${picker}
    </div>
    <h3>${esc(title)}</h3>
    ${owner ? ownerStep(step) : buyerStep(step)}`;
}

// ------------------------------------------------ existing installation: steps

function ownerStep(step) {
  const sim = state.sim;
  const unit = step.unit === 'day' ? 'this day' : step.unit === 'week' ? 'this week' : 'this month';
  const ids = ['manual', 'smartGrid', ...(sim.results.actual ? ['actual'] : [])];
  const rows = ids.map((id) => {
    const mask = id === 'actual' ? sim.mask : null;
    const t = strategyTotals(id, step.from, step.to, mask);
    const run = strategyTotals(id, 0, step.to, mask);
    return `<tr><td>${key(id)}${esc(label(id))}</td><td>${t.hours ? money(t.netWithWear, 2) : '–'}</td><td>${run.hours ? money(run.netWithWear, 0) : '–'}</td></tr>`;
  }).join('');
  const extra = saving(sim.results.smartGrid, sim.results.manual, step.from, step.to);
  const running = saving(sim.results.smartGrid, sim.results.manual, 0, step.to);
  const actual = sim.results.actual && strategyTotals('actual', step.from, step.to, sim.mask).hours
    ? ` · over actual ${signed(saving(sim.results.smartGrid, sim.results.actual, step.from, step.to, sim.mask), 2)}` : '';
  return `<p class="headline">Smart software: <span class="${extra > 0.005 ? 'pos' : extra < -0.005 ? 'neg' : ''}">${signed(extra, 2)}</span> ${unit}${actual} · ${signed(running)} since ${shortDate(sim.days[0].date)}</p>
    <div class="table-wrap"><table><thead><tr><th>Strategy</th><th>Cost incl. wear, ${unit} (− = income)</th><th>Since ${shortDate(sim.days[0].date)}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${step.unit === 'day' ? ownerDay(step) : ownerDays(step)}`;
}

function before(rows, from, cfg, id) {
  if (from > 0) return rows[from - 1];
  const start = startEnergy(cfg, id);
  return { solarE: 0, gridE: 0, startE: start, energy: start };
}

function does(r) {
  const action = hourAction(r);
  const amount = { sell: r.batToGrid, buy: r.gridToBat, store: r.pvToBat, cover: r.batToLoad }[action];
  return amount === undefined ? '–' : `${ACTION_LABELS[action]} ${num(amount, 1)}`;
}

function cashOf(r) {
  return r.revenue - r.cost - r.wear;
}

// @req LAB-17
function storyHtml(id, blocks, start, t, cfg) {
  const level = (e) => pct((100 * e) / cfg.capacity);
  const items = blocks.map((b) => {
    let what;
    let cash = '';
    if (b.action === 'sell') {
      what = `sells ${energy(b.sold, 1)} at ${priceRange(b.sellPrices)} kr.${b.covered > 0.05 ? `, covers the house with ${energy(b.covered, 1)}` : ''}`;
      cash = `<span class="pos">${signed(b.soldCash, 2)}</span>`;
    } else if (b.action === 'buy') {
      what = `buys ${energy(b.bought, 1)} from the grid at ${priceRange(b.buyPrices)} kr.${b.stored > 0.05 ? ` and stores ${energy(b.stored, 1)} of solar` : ''}`;
      cash = `<span class="neg">${signed(-b.boughtCash, 2)}</span>`;
    } else if (b.action === 'store') {
      what = `stores ${energy(b.stored, 1)} of solar${b.covered > 0.05 ? `, covers the house with ${energy(b.covered, 1)}` : ''}`;
    } else if (b.action === 'cover') {
      what = `covers the house with ${energy(b.covered, 1)}${b.sold > 0.05 ? ` and sells the last ${energy(b.sold, 1)}` : ''}`;
      cash = `<span class="muted">saves ${money(b.coverValue, 2)}</span>${b.sold > 0.05 ? ` <span class="pos">${signed(b.soldCash, 2)}</span>` : ''}`;
    } else {
      what = 'waits';
    }
    return `<li><span class="when">${hourRange(b.from, b.to)}</span><span>${what} <span class="level">· battery ${level(b.endEnergy)}</span></span><span class="cash">${cash}</span></li>`;
  }).join('');
  const origin = start.energy > 1e-6 ? ` (${pct((100 * start.solarE) / start.energy)} solar)` : '';
  return `<div class="story"><h4>${key(id)}${esc(label(id))}</h4>
    <p class="muted small">Battery at midnight ${level(start.energy)}${origin} · the day costs ${money(t.netWithWear, 2)} incl. wear</p>
    <ol class="timeline">${items}</ol></div>`;
}

// @req LAB-17
function whyHtml(cmp, cfg) {
  const level = (e) => pct((100 * e) / cfg.capacity);
  const more = (v) => (v > 0 ? 'more' : 'less');
  const lines = [];
  if (Math.abs(cmp.boughtMore) > 0.05) {
    lines.push(`Smart software buys ${energy(Math.abs(cmp.boughtMore), 1)} ${more(cmp.boughtMore)} into the battery from the grid${cmp.other.avgBuy !== null ? `, on average at ${price(cmp.other.avgBuy)} kr./kWh` : ''}.`);
  }
  if (Math.abs(cmp.soldMore) > 0.05) {
    lines.push(`It sells ${energy(Math.abs(cmp.soldMore), 1)} ${more(cmp.soldMore)} from the battery${cmp.other.avgSell !== null ? `, on average at ${price(cmp.other.avgSell)} kr./kWh` : ''}.`);
  }
  if (Math.abs(cmp.coveredMore) > 0.05) {
    lines.push(`It covers the house with ${energy(Math.abs(cmp.coveredMore), 1)} ${more(cmp.coveredMore)} from the battery instead of buying.`);
  }
  if (!lines.length) lines.push('Both do practically the same today.');
  if (Math.abs(cmp.wearMore) > 0.005) lines.push(`Wear: ${money(Math.abs(cmp.wearMore), 2)} ${cmp.wearMore > 0 ? 'more' : 'less'}, already counted.`);
  lines.push(`Battery at the end of the day: today ${level(cmp.base.endEnergy)}, smart ${level(cmp.other.endEnergy)}. What is left is used the next day, so part of a day's difference belongs to the day after.`);
  const verb = cmp.extra >= 0 ? `earns ${money(cmp.extra, 2)} more` : `is ${money(-cmp.extra, 2)} behind`;
  return `<div class="why"><b>Why smart software ${verb} this day</b><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
}

// @req LAB-10 LAB-11 LAB-17
function ownerDay(step) {
  const sim = state.sim;
  const cfg = sim.cfg;
  const { from, to } = step;
  const hours = sim.hours.slice(from, to);
  const today = sim.results.manual.slice(from, to);
  const smart = sim.results.smartGrid.slice(from, to);
  const todayStart = before(sim.results.manual, from, cfg, 'manual');
  const smartStart = before(sim.results.smartGrid, from, cfg, 'smartGrid');
  const cmp = compareRuns(sim.results.manual, sim.results.smartGrid, from, to);
  const level = (e) => (100 * e) / cfg.capacity;
  const tips = hours.map((h, i) => `${hh(h.hour)}:00 · buy ${price(today[i].buy)} · sell ${price(today[i].sell)} kr./kWh`
    + `\nSolar ${num(today[i].pv, 1)} · house ${num(today[i].load, 1)} kWh`
    + `\nToday: ${does(today[i])} · battery ${pct(level(today[i].energy))}`
    + `\nSmart: ${does(smart[i])} · battery ${pct(level(smart[i].energy))}`
    + `\nSmart − today: ${signed(cashOf(smart[i]) - cashOf(today[i]), 2)}`);
  const width = contentWidth($('#explorer'));
  const sp = dayPanels({ width, hours, rows: smart, before: smartStart, cfg, tips });
  const tp = dayPanels({ width, hours, rows: today, before: todayStart, cfg, tips });
  const levels = levelLines({
    width, hours, tips, minPct: state.settings.battery.minSocPct,
    series: [
      { color: INFO.manual.color, values: [todayStart, ...today].map((r) => level(r.energy)) },
      { color: INFO.smartGrid.color, values: [smartStart, ...smart].map((r) => level(r.energy)) },
    ],
  });
  const flowLegend = legend([{ label: 'From solar', color: 'var(--c-yellow)' }, { label: 'From grid', color: 'var(--c-blue)' }, { label: 'To house', color: 'var(--c-aqua)' }, { label: 'Sold', color: 'var(--c-violet)' }]);
  const originLegend = legend([{ label: 'Solar', color: 'var(--c-yellow)' }, { label: 'Grid', color: 'var(--c-blue)' }, { label: 'At period start', color: 'var(--c-gray)' }]);
  const table = hours.map((h, i) => {
    const t = today[i];
    const s = smart[i];
    const d = cashOf(s) - cashOf(t);
    return `<tr><td>${hh(h.hour)}:00</td><td>${price(t.buy)}</td><td>${price(t.sell)}</td><td>${num(t.pv, 1)}</td><td>${num(t.load, 1)}</td>
      <td>${does(t)}</td><td>${pct(level(t.energy))}</td><td>${does(s)}</td><td>${pct(level(s.energy))}</td>
      <td class="${d > 0.005 ? 'pos' : d < -0.005 ? 'neg' : ''}">${signed(d, 2)}</td></tr>`;
  }).join('');
  const dayRows = hours.map((h, i) => ({ hour: h.hour, buy: today[i].priced ? today[i].buy : NaN, sell: today[i].sell, pv: today[i].pv, load: today[i].load }));

  return `
    <div class="stories">
      ${storyHtml('manual', dayStory(today, hours), todayStart, cmp.base, cfg)}
      ${storyHtml('smartGrid', dayStory(smart, hours), smartStart, cmp.other, cfg)}
    </div>
    ${whyHtml(cmp, cfg)}
    <p class="muted small">Hover or tap an hour in a chart to see both strategies.</p>
    <p class="panel-title">Prices, kr./kWh</p>
    ${legend([{ label: 'Buy (full price)', color: 'var(--c-blue)', line: true }, { label: 'Sell', color: 'var(--c-violet)', line: true }])}
    ${sp.prices}
    <p class="panel-title">Battery level, % of capacity</p>
    ${legend([{ label: label('manual'), color: INFO.manual.color, line: true }, { label: label('smartGrid'), color: INFO.smartGrid.color, line: true }])}
    ${levels}
    <p class="panel-title">Smart software: energy in and out of the battery, kWh (up = in, down = out)</p>
    ${flowLegend}
    ${sp.flows}
    <details class="more"><summary>More charts: today's energy and where the stored energy came from</summary>
      <p class="panel-title">Today (manual): energy in and out of the battery, kWh</p>${flowLegend}${tp.flows}
      <p class="panel-title">Smart software: battery content by origin, % of capacity</p>${originLegend}${sp.level}
      <p class="panel-title">Today (manual): battery content by origin, % of capacity</p>${originLegend}${tp.level}
      <p class="muted small">Dashed line: lowest allowed level (${pct(state.settings.battery.minSocPct)}).</p>
    </details>
    ${rulesHtml(breakEven(cfg, dayRows.filter((d) => Number.isFinite(d.buy))))}
    <details class="more"><summary>Hour by hour, side by side</summary><div class="table-wrap"><table>
      <thead><tr><th>Hour</th><th>Buy</th><th>Sell</th><th>Solar</th><th>House</th><th>Today does</th><th>Level</th><th>Smart does</th><th>Level</th><th>Smart − today</th></tr></thead>
      <tbody>${table}</tbody></table></div><p class="hint">Prices in kr./kWh, energy in kWh. "Smart − today" is the hour's cash difference after wear.</p></details>`;
}

// @req LAB-10
function ownerDays(step) {
  const sim = state.sim;
  const width = contentWidth($('#explorer'));
  const withActual = Boolean(sim.results.actual);
  const bars = step.days.map((d) => {
    const s = saving(sim.results.smartGrid, sim.results.manual, d.from, d.to);
    return { label: shortDate(d.date), value: s, date: d.date, tip: `${longDate(d.date)}\nSmart software over today: ${signed(s, 2)}\nClick to open the day` };
  });
  const rows = step.days.map((d) => {
    const t = totals(sim.results.manual, d.from, d.to).netWithWear;
    const s = totals(sim.results.smartGrid, d.from, d.to).netWithWear;
    const a = withActual ? totals(sim.results.actual, d.from, d.to, { mask: sim.mask }) : null;
    return `<tr class="clickable" data-action="open-day" data-date="${d.date}"><td>${weekdayName(d.date).slice(0, 3)} ${shortDate(d.date)}</td>
      <td>${money(t, 2)}</td><td>${money(s, 2)}</td><td class="${t - s > 0.005 ? 'pos' : t - s < -0.005 ? 'neg' : ''}">${signed(t - s, 2)}</td>
      ${withActual ? `<td>${a.hours ? money(a.netWithWear, 2) : '–'}</td>` : ''}</tr>`;
  }).join('');
  const t = totals(sim.results.manual, step.from, step.to).netWithWear;
  const s = totals(sim.results.smartGrid, step.from, step.to).netWithWear;
  const a = withActual ? totals(sim.results.actual, step.from, step.to, { mask: sim.mask }) : null;
  return `<p class="panel-title">Smart software over today, per day, kr.</p>
    ${barChart({ width, bars, color: INFO.smartGrid.color })}
    <div class="table-wrap"><table>
      <thead><tr><th>Day</th><th>${key('manual')}${esc(label('manual'))}</th><th>${key('smartGrid')}${esc(label('smartGrid'))}</th><th>Smart over today</th>${withActual ? `<th>${key('actual')}${esc(label('actual'))}</th>` : ''}</tr></thead>
      <tbody>${rows}<tr class="highlight"><td>Total</td><td>${money(t)}</td><td>${money(s)}</td><td>${signed(t - s)}</td>${withActual ? `<td>${a.hours ? money(a.netWithWear) : '–'}</td>` : ''}</tr></tbody>
    </table></div><p class="hint">Cost incl. wear per day (− = income). Select a day to see it told hour by hour. A single day can go against smart software: power bought one day is often sold the next, so judge weeks and months.</p>`;
}

// ------------------------------------------------ new installation: steps

function buyerStep(step) {
  const sim = state.sim;
  const unit = step.unit === 'day' ? 'this day' : step.unit === 'week' ? 'this week' : 'this month';
  const rows = BUYER.map((id) => {
    const t = strategyTotals(id, step.from, step.to);
    const s = id === 'nothing' ? null : saving(sim.results[id], sim.results.nothing, step.from, step.to);
    const run = id === 'nothing' ? null : saving(sim.results[id], sim.results.nothing, 0, step.to);
    return `<tr class="${id === state.view.strategy ? 'highlight' : ''}"><td>${key(id)}${esc(label(id))}</td>
      <td>${money(t.netWithWear, 2)}</td><td class="${s > 0.005 ? 'pos' : s < -0.005 ? 'neg' : ''}">${s === null ? '–' : signed(s, 2)}</td>
      <td>${run === null ? '–' : signed(run, 0)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Setup</th><th>Cost incl. wear, ${unit}</th><th>Saved vs nothing</th><th>Saved since ${shortDate(sim.days[0].date)}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${step.unit === 'day' ? buyerDay(step) : buyerDays(step)}`;
}

function hourTip(h, r, cfg, name) {
  const share = (e) => (r.energy > 1e-6 ? (100 * e) / r.energy : 0);
  return `${hh(h.hour)}:00 · ${ACTION_LABELS[hourAction(r)]} (${name})`
    + `\nBuy ${price(r.buy)} · sell ${price(r.sell)} kr./kWh`
    + `\nSolar ${num(r.pv, 2)} · house ${num(r.load, 2)} kWh`
    + `\nInto battery: solar ${num(r.pvToBat, 2)} · grid ${num(r.gridToBat, 2)}`
    + `\nOut: house ${num(r.batToLoad, 2)} · grid ${num(r.batToGrid, 2)}`
    + `\nBattery ${pct((100 * r.energy) / cfg.capacity)} – solar ${pct(share(r.solarE))}, grid ${pct(share(r.gridE))}`
    + `\nCash ${signed(r.revenue - r.cost, 2)}`;
}

// @req LAB-10 LAB-11
function buyerDay(step) {
  const sim = state.sim;
  const id = state.view.strategy;
  const cfg = sim.cfg;
  const rows = sim.results[id].slice(step.from, step.to);
  const hours = sim.hours.slice(step.from, step.to);
  const start = before(sim.results[id], step.from, cfg, id);
  const name = label(id);
  const tips = rows.map((r, i) => hourTip(hours[i], r, cfg, name));
  const panels = dayPanels({ width: contentWidth($('#explorer')), hours, rows, before: start, cfg, tips });
  const t = totals(sim.results[id], step.from, step.to);
  const dayRows = hours.map((h, i) => ({ hour: h.hour, buy: rows[i].priced ? rows[i].buy : NaN, sell: rows[i].sell, pv: rows[i].pv, load: rows[i].load }));
  const battery = id !== 'none';
  return `
    ${battery ? `<div class="stories">${storyHtml(id, dayStory(rows, hours), start, t, cfg)}</div>` : ''}
    <p class="muted small">Charts show <b>${esc(name)}</b>. Hover or tap an hour for details.</p>
    <p class="panel-title">Prices, kr./kWh</p>
    ${legend([{ label: 'Buy (full price)', color: 'var(--c-blue)', line: true }, { label: 'Sell', color: 'var(--c-violet)', line: true }])}
    ${panels.prices}
    ${battery ? `<p class="panel-title">Battery energy per hour, kWh (up = in, down = out)</p>
    ${legend([{ label: 'From solar', color: 'var(--c-yellow)' }, { label: 'From grid', color: 'var(--c-blue)' }, { label: 'To house', color: 'var(--c-aqua)' }, { label: 'Sold', color: 'var(--c-violet)' }])}
    ${panels.flows}
    <p class="panel-title">Battery level, % of capacity, by where the energy came from</p>
    ${legend([{ label: 'Solar', color: 'var(--c-yellow)' }, { label: 'Grid', color: 'var(--c-blue)' }, { label: 'At period start', color: 'var(--c-gray)' }])}
    ${panels.level}
    ${rulesHtml(breakEven(cfg, dayRows.filter((d) => Number.isFinite(d.buy))))}` : ''}`;
}

// @req LAB-10
function buyerDays(step) {
  const sim = state.sim;
  const id = state.view.strategy;
  const width = contentWidth($('#explorer'));
  const bars = step.days.map((d) => {
    const s = saving(sim.results[id], sim.results.nothing, d.from, d.to);
    return { label: shortDate(d.date), value: s, date: d.date, tip: `${longDate(d.date)}\n${label(id)}: saved ${money(s, 2)}\nClick to open the day` };
  });
  const rows = step.days.map((d) => `<tr class="clickable" data-action="open-day" data-date="${d.date}"><td>${weekdayName(d.date).slice(0, 3)} ${shortDate(d.date)}</td>${BUYER.map((x) => `<td>${money(totals(sim.results[x], d.from, d.to).netWithWear, 2)}</td>`).join('')}</tr>`).join('');
  return `<p class="panel-title">${esc(label(id))}: saved against no solar and no battery, per day, kr.</p>
    ${barChart({ width, bars, color: INFO[id].color })}
    <div class="table-wrap"><table>
      <thead><tr><th>Day</th>${BUYER.map((x) => `<th>${key(x)}${esc(label(x))}</th>`).join('')}</tr></thead>
      <tbody>${rows}<tr class="highlight"><td>Total</td>${BUYER.map((x) => `<td>${money(totals(sim.results[x], step.from, step.to).netWithWear)}</td>`).join('')}</tr></tbody>
    </table></div><p class="hint">Cost incl. wear per day (− = income). Select a day to open it.</p>`;
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
    const verdict = r.pays ? `<span class="pos">Pays, ${price(r.gain)} kr./kWh to spare</span>`
      : r.to.hour <= r.from.hour ? '<span class="muted">Best hour comes first</span>'
        : `<span class="muted">Short by ${price(-r.gain)}</span>`;
    return `<tr><td>${esc(RULE_LABELS[r.id])}</td><td>${hh(r.from.hour)}:00 at ${price(nowPrice)}</td><td>${price(r.need)}</td>
      <td>${hh(r.to.hour)}:00 at ${price(r.later)}</td><td>${verdict}</td></tr>`;
  }).join('');
  return `<details class="more"><summary>When does it pay on this day?</summary>
    <div class="table-wrap"><table class="rules"><thead><tr><th>Use</th><th>Now</th><th>Later must beat</th><th>Best later</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="formula">η = ${pct(be.eta * 100, 1)} round trip · w = ${price(be.wear)} wear · m = ${price(be.margin)} margin<br>
    from grid: later &gt; (buy now + m) ÷ η + w · from solar: later &gt; sell now ÷ η + w</p>
    <p class="hint">"Now" is the day's cheapest buy hour, or the sunny hour with the lowest sell price. "Later" is the best sell hour or the dearest buy hour. The optimiser does this for every pair of hours, within the battery's power and size – a full battery cannot buy more.</p></details>`;
}

function methodHtml() {
  return `<details class="more"><summary>How the lab calculates</summary><div class="small">
    <p><b>Prices.</b> Every hour uses the price that applied then for the chosen grid company, from stromligning.dk: spot, Energinet's system and net tariffs, the grid company's time-of-use tariff and the electricity tax of that date, plus the supplier markup, times 1,25 VAT. Selling gets the spot price minus production tariffs and the supplier's fee, without VAT.</p>
    <p><b>Solar.</b> Open-Meteo's historical irradiance on the panel plane × size × performance ratio, corrected for cell temperature. Imported production replaces it.</p>
    <p><b>Consumption.</b> A typical Danish daily and seasonal profile scaled to the yearly kWh, a heat pump following degree-hours below 17 °C, and cars charged in the cheapest hours of their overnight window. Imported consumption replaces it.</p>
    <p><b>Optimiser.</b> Dynamic programming over the battery level in ${price(state.settings.strategy.stepKwh)} kWh steps. Every day at 13:00, when tomorrow's prices are published, it plans the hours until tomorrow midnight and carries out the next 24 hours. It minimises purchases − sales + wear + margin on grid purchases, and values energy left at the end at the window's cheapest buy price. "Today (manual)" uses the same planner but may only buy into the battery at or below the nearly-free limit; "Smart, solar only" never; "Smart software" whenever it pays.</p>
    <p><b>Optimistic on purpose.</b> Inside a planning window the solar and consumption are taken as known; a real controller works from forecasts and will do somewhat worse. Hourly resolution: since October 2025 the market trades quarter-hours, which a controller could use for a little extra. No standby losses of the battery or inverter.</p>
    <p><b>Left out.</b> Subscriptions and fixed fees (the same in every strategy), payments for flexibility or frequency services, interest, price changes over the years, and any change in how the grid company bills a battery.</p>
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
    // Purchase prices change no simulation, only the payback.
    if (path.startsWith('invest.')) renderResults();
    else scheduleCalculate();
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
  for (const name of ['from', 'to']) {
    const input = document.querySelector(`[data-period="${name}"]`);
    if (input) input.value = state.period[name];
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
  } else if (action === 'mode') {
    if (state.mode === el.dataset.mode) return;
    state.mode = el.dataset.mode === 'buyer' ? 'buyer' : 'owner';
    save('lab.mode', state.mode);
    renderPage();
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
