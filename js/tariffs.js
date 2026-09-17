// Tariffs, taxes and the "full price" model.
//
// The spot price is only part of what a Danish household pays per kWh:
//   full price = (spot + Energinet system tariff + Energinet net tariff
//                 + electricity tax + grid company tariff + supplier surcharge) × 1.25 VAT
//
// Tariffs come from stromligning.dk (CORS-open, per grid company, 15-minute
// resolution) and are averaged to hours. They are cached per day. For days
// without data (e.g. history or forecast days) the nearest cached day's hourly
// profile is used, and as a last resort the national 2026 defaults.

import { load, save, remove, keysWithPrefix } from './storage.js';
import { addDays } from './time.js';

const API = 'https://stromligning.dk/api';
export const VAT_RATE = 0.25;

// National tariffs and electricity tax, kr./kWh excl. VAT (2026).
// Used only when no tariff data has been fetched yet.
export const NATIONAL_DEFAULTS = Object.freeze({ system: 0.072, net: 0.043, tax: 0.008 });

const COMPANIES_KEY = 'grid.companies';
const COMPANIES_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function tariffKey(area, gridId, date) {
  return `tariffs.${area}.${gridId || 'none'}.${date}`;
}

/** Grid companies (netselskaber) for all price areas. Cached for a week. */
export async function getGridCompanies({ force = false } = {}) {
  const cached = load(COMPANIES_KEY);
  if (!force && cached && Date.now() - cached.fetchedAt < COMPANIES_MAX_AGE_MS) return cached.list;
  try {
    const response = await fetch(`${API}/suppliers`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    const list = raw
      .filter((s) => s.id && s.name && s.priceArea)
      .filter((s) => !/udgået/i.test(s.name))
      .map((s) => ({ id: s.id, name: s.name, priceArea: s.priceArea }))
      .sort((a, b) => a.name.localeCompare(b.name, 'da'));
    save(COMPANIES_KEY, { fetchedAt: Date.now(), list });
    return list;
  } catch (err) {
    if (cached?.list) return cached.list;
    throw err;
  }
}

/** Cached grid companies without fetching (may be empty). */
export function cachedGridCompanies() {
  return load(COMPANIES_KEY)?.list ?? [];
}

/**
 * Hourly tariffs for one day. Resolves to null when the day is not available
 * (stromligning only knows days whose spot prices are published).
 * @returns {Promise<TariffDay|null>} { date, area, grid, hours: [{ hour, system, net, tax, grid }] }
 */
export async function fetchDayTariffs(area, gridId, date, { force = false } = {}) {
  const key = tariffKey(area, gridId, date);
  const cached = load(key);
  if (cached && !force) return cached;

  const params = new URLSearchParams({ priceArea: area, from: `${date}T00:00:00`, to: `${date}T23:45:00` });
  if (gridId) params.set('supplierId', gridId);
  const response = await fetch(`${API}/Prices?${params}`);
  if (!response.ok) throw new Error(`Tariffs: HTTP ${response.status}`);
  const raw = await response.json();
  const points = raw.prices ?? [];
  if (!points.length) return null;

  // Group quarters by local hour. On the DST fall-back day hour 02 appears twice;
  // averaging them is fine because tariffs are the same for both.
  const groups = new Map();
  for (const p of points) {
    if (!p.localDate?.startsWith(date)) continue;
    const hour = Number(p.localDate.slice(11, 13));
    const d = p.details ?? {};
    const g = groups.get(hour) ?? { hour, system: 0, net: 0, tax: 0, grid: 0, n: 0 };
    g.system += d.transmission?.systemTariff?.value ?? 0;
    g.net += d.transmission?.netTariff?.value ?? 0;
    g.tax += d.electricityTax?.value ?? 0;
    g.grid += d.distribution?.value ?? 0;
    g.n += 1;
    groups.set(hour, g);
  }
  const hours = [...groups.values()]
    .sort((a, b) => a.hour - b.hour)
    .map((g) => ({
      hour: g.hour,
      system: round(g.system / g.n),
      net: round(g.net / g.n),
      tax: round(g.tax / g.n),
      grid: round(g.grid / g.n),
    }));

  const day = { date, area, grid: gridId || '', hours, fetchedAt: new Date().toISOString() };
  save(key, day);
  datesMemo.at = 0;
  return day;
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Synchronous tariff lookup for rendering: exact day if cached, otherwise the
 * closest cached day (same grid company), otherwise national defaults.
 * @returns {{ byHour: Map<number, {system, net, tax, grid}>, source: 'exact'|'nearest'|'default', date?: string }}
 */
export function tariffProfileFor(area, gridId, date) {
  const exact = load(tariffKey(area, gridId, date));
  if (exact?.hours?.length) return { byHour: toMap(exact.hours), source: 'exact', date };

  const prefix = `tariffs.${area}.${gridId || 'none'}.`;
  const dates = cachedTariffDates(prefix);
  if (dates.length) {
    let nearest = dates[0];
    for (const d of dates) {
      if (Math.abs(dayDiff(d, date)) < Math.abs(dayDiff(nearest, date))) nearest = d;
    }
    const day = load(prefix + nearest);
    if (day?.hours?.length) return { byHour: toMap(day.hours), source: 'nearest', date: nearest };
  }

  const fallback = new Map();
  for (let h = 0; h < 24; h++) fallback.set(h, { ...NATIONAL_DEFAULTS, grid: 0 });
  return { byHour: fallback, source: 'default' };
}

// Listing localStorage keys is slow-ish; memoise briefly (history renders many days).
let datesMemo = { prefix: '', at: 0, dates: [] };
function cachedTariffDates(prefix) {
  if (datesMemo.prefix === prefix && Date.now() - datesMemo.at < 2000) return datesMemo.dates;
  const dates = keysWithPrefix(prefix).map((k) => k.slice(prefix.length)).sort();
  datesMemo = { prefix, at: Date.now(), dates };
  return dates;
}

function toMap(hours) {
  return new Map(hours.map((h) => [h.hour, h]));
}

function dayDiff(a, b) {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
}

/** Remove cached tariff days older than `keepDays`. */
export function pruneOldTariffs(todayStr, keepDays = 45) {
  const cutoff = addDays(todayStr, -keepDays);
  for (const key of keysWithPrefix('tariffs.')) {
    const date = key.split('.').pop();
    if (date < cutoff) remove(key);
  }
}

/**
 * Apply the user's price model to spot-price hours.
 * Every returned hour has `price` (what the app shows) plus a `parts` breakdown.
 */
export function applyPriceModel(hours, settings, profile) {
  const full = settings.priceMode !== 'spot';
  const surcharge = full ? settings.supplierSurcharge || 0 : 0;
  return hours.map((h) => {
    const spot = h.spot ?? h.price;
    if (!full) {
      return { ...h, spot, price: spot, parts: { spot, system: 0, net: 0, tax: 0, grid: 0, surcharge: 0, vat: 0 } };
    }
    const t = profile.byHour.get(h.hour) ?? { ...NATIONAL_DEFAULTS, grid: 0 };
    const exVat = spot + t.system + t.net + t.tax + t.grid + surcharge;
    const vat = exVat * VAT_RATE;
    return {
      ...h,
      spot,
      price: exVat + vat,
      parts: { spot, system: t.system, net: t.net, tax: t.tax, grid: t.grid, surcharge, vat },
    };
  });
}

/**
 * Non-spot cost per kWh (excl. VAT) for converting spot forecasts to displayed prices.
 * `avg` is the average over the window hours, `min3` the cheapest 3 consecutive hours.
 */
export function addOnForWindow(settings, profile, window) {
  if (settings.priceMode === 'spot') return { avg: 0, min3: 0, factor: 1 };
  const surcharge = settings.supplierSurcharge || 0;
  const values = [];
  for (let h = window.start; h < window.end; h++) {
    const t = profile.byHour.get(h) ?? { ...NATIONAL_DEFAULTS, grid: 0 };
    values.push(t.system + t.net + t.tax + t.grid + surcharge);
  }
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  let min3 = avg;
  for (let i = 0; i + 3 <= values.length; i++) min3 = Math.min(min3, (values[i] + values[i + 1] + values[i + 2]) / 3);
  return { avg, min3, factor: 1 + VAT_RATE };
}

/** Convert a spot price to the displayed price with a given add-on (excl. VAT). */
export function toDisplayPrice(spot, add, factor) {
  return (spot + add) * factor;
}

/** Spot hours for a date → priced hours using the cached tariff profile for that date. */
export function priceHours(settings, date, spotHours) {
  const profile = tariffProfileFor(settings.priceArea, settings.gridCompany, date);
  return { hours: applyPriceModel(spotHours, settings, profile), tariffSource: profile.source };
}
