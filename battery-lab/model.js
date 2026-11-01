// Battery Lab model: settings and the hourly series a simulation runs on.
// Pure functions – no DOM, no storage, no network (LAB-01). Hours are absolute
// instants (ms, UTC) with their Danish date and clock hour, so DST days have 23
// or 25 entries and every source can be joined on the instant.

import { addDays, danishMidnight, nowInDenmark } from '../js/time.js';
import { isOffDay } from '../js/holidays.js';

export const VAT_RATE = 0.25;
export const HOUR_MS = 3600000;

/** Danish normal year: 2 906 degree days below 17 °C (DMI), as degree-hours. */
export const NORMAL_DEGREE_HOURS = 2906 * 24;

// Relative household use per clock hour. Normalised below so that a week averages 1.
const WEEKDAY_PROFILE = [0.55, 0.5, 0.48, 0.47, 0.48, 0.56, 0.86, 1.05, 0.95, 0.85, 0.82, 0.85,
  0.9, 0.85, 0.83, 0.9, 1.15, 1.55, 1.7, 1.5, 1.3, 1.15, 0.95, 0.72];
const OFFDAY_PROFILE = [0.62, 0.55, 0.5, 0.48, 0.48, 0.5, 0.6, 0.78, 0.98, 1.1, 1.12, 1.12,
  1.12, 1.05, 1.0, 1.02, 1.15, 1.45, 1.6, 1.45, 1.3, 1.15, 0.98, 0.78];
// Relative use per month, January first. Normalised by days per month below.
const MONTH_FACTOR = [1.22, 1.15, 1.05, 0.95, 0.88, 0.82, 0.8, 0.83, 0.92, 1.03, 1.15, 1.22];
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const WEEK_MEAN = (5 * sum(WEEKDAY_PROFILE) + 2 * sum(OFFDAY_PROFILE)) / (7 * 24);
const MONTH_MEAN = MONTH_FACTOR.reduce((a, f, m) => a + f * DAYS_IN_MONTH[m], 0) / sum(DAYS_IN_MONTH);

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

/** The reference household. Unknown values are assumptions, marked as such in the UI. */
// @req LAB-13
export function defaultSettings() {
  return {
    version: 1,
    location: { label: 'Horsens', lat: 55.86, lon: 9.85 },
    prices: { area: 'DK1', gridCompany: 'konstant_c', buyMarkup: 0.05, sellFee: 0.02, taxOverride: null },
    battery: {
      capacityKwh: 60, minSocPct: 20, maxSocPct: 100, startSocPct: 50,
      chargeKw: 10, dischargeKw: 10, chargeEff: 95, dischargeEff: 95,
    },
    grid: { exportKw: 10, importKw: 24 },
    solar: {
      arrays: [{ kwp: 15, tilt: 30, azimuth: 0 }, { kwp: 0, tilt: 30, azimuth: 90 }],
      performanceRatio: 85, tempCoeff: -0.35,
    },
    house: { annualKwh: 5000, heatPumpKwh: 0 },
    cars: [
      { kwhPerDay: 8, chargerKw: 11, plugIn: 17, ready: 7, smart: true },
      { kwhPerDay: 5, chargerKw: 11, plugIn: 17, ready: 7, smart: true },
    ],
    strategy: {
      wear: 0.1, gridMargin: 0.05, sellThreshold: 1.5, manualBuyBelow: 0.3,
      planner: 'dayAhead', stepKwh: 0.5, curtail: true,
    },
    // Purchase prices incl. VAT for the new-installation view (LAB-16). Panels and
    // rails mounted by the owner; electrical work by an authorised electrician.
    invest: { panelPerKwp: 2000, inverter: 20000, batteryPerKwh: 1500, electrician: 15000, other: 5000 },
  };
}

// Allowed range per numeric setting; array items share the bounds of their list.
const BOUNDS = {
  'location.lat': [54, 58], 'location.lon': [7, 16],
  'prices.buyMarkup': [-1, 5], 'prices.sellFee': [-1, 5], 'prices.taxOverride': [0, 5],
  'battery.capacityKwh': [1, 500], 'battery.minSocPct': [0, 95], 'battery.maxSocPct': [5, 100],
  'battery.startSocPct': [0, 100], 'battery.chargeKw': [0.1, 100], 'battery.dischargeKw': [0.1, 100],
  'battery.chargeEff': [50, 100], 'battery.dischargeEff': [50, 100],
  'grid.exportKw': [0, 100], 'grid.importKw': [1, 200],
  'solar.arrays.kwp': [0, 100], 'solar.arrays.tilt': [0, 90], 'solar.arrays.azimuth': [-180, 180],
  'solar.performanceRatio': [30, 100], 'solar.tempCoeff': [-1, 0],
  'house.annualKwh': [0, 100000], 'house.heatPumpKwh': [0, 50000],
  'cars.kwhPerDay': [0, 150], 'cars.chargerKw': [1, 50], 'cars.plugIn': [0, 23], 'cars.ready': [0, 23],
  'strategy.wear': [0, 5], 'strategy.gridMargin': [0, 5], 'strategy.sellThreshold': [-5, 20],
  'strategy.stepKwh': [0.1, 5], 'strategy.manualBuyBelow': [-5, 10],
  'invest.panelPerKwp': [0, 100000], 'invest.inverter': [0, 1000000], 'invest.batteryPerKwh': [0, 100000],
  'invest.electrician': [0, 1000000], 'invest.other': [0, 1000000],
};
const CHOICES = { 'prices.area': ['DK1', 'DK2'], 'strategy.planner': ['dayAhead', 'hindsight'] };

/**
 * Settings from storage or the form → complete, clamped settings. Unknown keys are
 * dropped, wrong types fall back to the default, numbers are clamped to BOUNDS.
 */
// @req LAB-13
export function normalizeSettings(raw) {
  const result = merge(defaultSettings(), raw ?? {}, '');
  const b = result.battery;
  if (b.maxSocPct < b.minSocPct + 5) b.maxSocPct = Math.min(100, b.minSocPct + 5);
  if (b.maxSocPct < b.minSocPct + 5) b.minSocPct = b.maxSocPct - 5;
  return result;
}

function merge(def, raw, path) {
  if (Array.isArray(def)) {
    return def.map((item, i) => merge(item, Array.isArray(raw) ? raw[i] : undefined, path));
  }
  if (def && typeof def === 'object') {
    const out = {};
    for (const key of Object.keys(def)) out[key] = merge(def[key], raw?.[key], path ? `${path}.${key}` : key);
    return out;
  }
  if (path === 'prices.taxOverride') {
    const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(',', '.')) : raw;
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, ...BOUNDS[path]) : null;
  }
  if (typeof def === 'number') {
    const v = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
    if (typeof v !== 'number' || !Number.isFinite(v)) return def;
    return BOUNDS[path] ? clamp(v, ...BOUNDS[path]) : v;
  }
  if (typeof def === 'boolean') return typeof raw === 'boolean' ? raw : def;
  if (typeof def === 'string') {
    if (typeof raw !== 'string' || !raw) return def;
    return CHOICES[path] && !CHOICES[path].includes(raw) ? def : raw;
  }
  return def;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Absolute instant of a Danish wall-clock time. In the repeated autumn hour this is the first one. */
export function danishInstant(date, hour, minute = 0) {
  const target = Date.parse(`${date}T00:00:00Z`) + hour * HOUR_MS + minute * 60000;
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const local = nowInDenmark(new Date(instant));
    const wall = Date.parse(`${local.date}T00:00:00Z`) + local.hour * HOUR_MS + local.minute * 60000;
    instant += target - wall;
  }
  const earlier = nowInDenmark(new Date(instant - HOUR_MS));
  const found = nowInDenmark(new Date(instant));
  if (earlier.date === found.date && earlier.hour === found.hour && earlier.minute === found.minute) return instant - HOUR_MS;
  return instant;
}

/** Every Danish clock hour from the start of `fromDate` to the end of `toDate`. */
export function buildHours(fromDate, toDate) {
  const start = danishMidnight(fromDate);
  const end = danishMidnight(addDays(toDate, 1));
  const hours = [];
  for (let t = start; t < end; t += HOUR_MS) {
    const local = nowInDenmark(new Date(t));
    hours.push({ t, date: local.date, hour: local.hour });
  }
  return hours;
}

/**
 * Buy and sell price per hour.
 * buyPoints: [{ t, spot, tariffs, tax, surcharge }] (kr./kWh excl. VAT),
 * sellPoints: [{ t, sell }] (kr./kWh after production tariffs).
 */
// @req LAB-02
export function priceSeries(hours, buyPoints, sellPoints, prices) {
  const buyBy = new Map(buyPoints.map((p) => [p.t, p]));
  const sellBy = new Map(sellPoints.map((p) => [p.t, p.sell]));
  const n = hours.length;
  const out = {
    buy: new Float64Array(n), sell: new Float64Array(n), spot: new Float64Array(n),
    priced: new Uint8Array(n), missing: 0, sellFromSpot: 0,
  };
  for (let i = 0; i < n; i++) {
    const p = buyBy.get(hours[i].t);
    if (!p) {
      out.missing += 1;
      continue;
    }
    const tax = prices.taxOverride ?? p.tax;
    out.buy[i] = (p.spot + p.tariffs + tax + (p.surcharge || 0) + prices.buyMarkup) * (1 + VAT_RATE);
    let sell = sellBy.get(hours[i].t);
    if (sell === undefined) {
      sell = p.spot;
      out.sellFromSpot += 1;
    }
    out.sell[i] = sell - prices.sellFee;
    out.spot[i] = p.spot;
    out.priced[i] = 1;
  }
  return out;
}

/**
 * Solar kWh per hour from irradiance on each array's plane.
 * weather: { temp: Map<ms, °C>, gti: [Map<ms, W/m²> per array] }, stamped at the END
 * of the hour they average (Open-Meteo's convention).
 */
// @req LAB-03
export function solarSeries(hours, weather, solar) {
  const n = hours.length;
  const pv = new Float64Array(n);
  let missing = 0;
  const pr = solar.performanceRatio / 100;
  const gamma = solar.tempCoeff / 100;
  for (let i = 0; i < n; i++) {
    const stamp = hours[i].t + HOUR_MS;
    const air = weather.temp.get(stamp) ?? weather.temp.get(hours[i].t) ?? 10;
    let kwh = 0;
    let known = true;
    solar.arrays.forEach((array, a) => {
      if (!(array.kwp > 0)) return;
      const g = weather.gti[a]?.get(stamp);
      if (g === undefined || g === null) {
        known = false;
        return;
      }
      kwh += pvKwh(array.kwp, g, air, pr, gamma);
    });
    if (!known) missing += 1;
    pv[i] = kwh;
  }
  return { pv, missing };
}

/** kWh in one hour for kWp at irradiance g (W/m²) and air temperature (°C). */
export function pvKwh(kwp, g, air, pr, gamma) {
  if (!(g > 0)) return 0;
  const cell = air + 0.03 * g;
  return Math.max(0, kwp * (g / 1000) * pr * (1 + gamma * (cell - 25)));
}

/** House base load per hour: yearly kWh shaped by hour, weekday/off-day and month. */
// @req LAB-04
export function houseSeries(hours, annualKwh) {
  const n = hours.length;
  const out = new Float64Array(n);
  const perHour = annualKwh / 8766;
  let lastDate = '';
  let profile = WEEKDAY_PROFILE;
  for (let i = 0; i < n; i++) {
    const { date, hour } = hours[i];
    if (date !== lastDate) {
      profile = isOffDay(date) ? OFFDAY_PROFILE : WEEKDAY_PROFILE;
      lastDate = date;
    }
    const month = Number(date.slice(5, 7)) - 1;
    out[i] = perHour * (profile[hour] / WEEK_MEAN) * (MONTH_FACTOR[month] / MONTH_MEAN);
  }
  return out;
}

/** Heat pump: yearly kWh in a normal year, spread by degree-hours below 17 °C. */
// @req LAB-04
export function heatPumpSeries(hours, annualKwh, temp) {
  const n = hours.length;
  const out = new Float64Array(n);
  if (!(annualKwh > 0)) return out;
  const perDegreeHour = annualKwh / NORMAL_DEGREE_HOURS;
  for (let i = 0; i < n; i++) {
    const t = temp.get(hours[i].t + HOUR_MS) ?? temp.get(hours[i].t);
    if (t === undefined) continue;
    out[i] = Math.max(0, 17 - t) * perDegreeHour;
  }
  return out;
}

/**
 * Electric car charging per hour. Each car plugs in at `plugIn` and must be full by
 * `ready` (next morning when ready ≤ plugIn). Smart charging fills the cheapest
 * priced hours of that window, otherwise charging starts at plug-in.
 */
// @req LAB-04
export function carSeries(hours, cars, buy, priced) {
  const n = hours.length;
  const out = new Float64Array(n);
  const index = new Map();
  hours.forEach((h, i) => {
    const key = `${h.date}T${h.hour}`;
    if (!index.has(key)) index.set(key, i);
  });
  const dates = [...new Set(hours.map((h) => h.date))];
  for (const car of cars) {
    if (!(car.kwhPerDay > 0) || !(car.chargerKw > 0)) continue;
    for (const date of dates) {
      const start = index.get(`${date}T${car.plugIn}`);
      if (start === undefined) continue;
      const endDate = car.ready <= car.plugIn ? addDays(date, 1) : date;
      const end = index.get(`${endDate}T${car.ready}`) ?? n;
      const slots = [];
      for (let i = start; i < end; i++) slots.push(i);
      if (car.smart && slots.every((i) => priced[i])) slots.sort((a, b) => buy[a] - buy[b] || a - b);
      let remaining = car.kwhPerDay;
      for (const i of slots) {
        if (remaining <= 1e-9) break;
        const kwh = Math.min(car.chargerKw, remaining);
        out[i] += kwh;
        remaining -= kwh;
      }
    }
  }
  return out;
}

/** Element-wise sum of series of equal length. */
export function addSeries(...series) {
  const out = new Float64Array(series[0].length);
  for (const s of series) for (let i = 0; i < s.length; i++) out[i] += s[i];
  return out;
}
