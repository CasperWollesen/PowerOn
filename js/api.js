// Data access: day-ahead prices (elprisenligenu.dk) and weather (Open-Meteo).
// This is the only module that talks to the network. Swapping the price source
// later (e.g. Energinet behind a proxy) should only touch this file.

import { load, save, remove, keysWithPrefix } from './storage.js';
import { hourFromIso, addDays } from './time.js';

const PRICE_BASE = 'https://www.elprisenligenu.dk/api/v1/prices';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';

export class NotPublishedError extends Error {
  constructor(date) {
    super(`Prices for ${date} are not published yet`);
    this.name = 'NotPublishedError';
    this.date = date;
  }
}

export function priceUrl(area, dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${PRICE_BASE}/${year}/${month}-${day}_${area}.json`;
}

function cacheKey(area, dateStr) {
  return `prices.${area}.${dateStr}`;
}

/**
 * Prices for one day.
 * @returns {Promise<DayPrices>} { area, date, hours: [{ hour, start, end, price }], fetchedAt, fromCache }
 * @throws {NotPublishedError} when the day is not available yet (HTTP 404)
 */
export async function getDayPrices(area, dateStr, { preferCache = true } = {}) {
  const key = cacheKey(area, dateStr);
  const cached = load(key);

  // A full published day never changes – no need to refetch it.
  if (preferCache && cached?.hours?.length >= 23) {
    return { ...cached, fromCache: true };
  }

  try {
    const response = await fetch(priceUrl(area, dateStr), { cache: 'no-cache' });
    if (response.status === 404) throw new NotPublishedError(dateStr);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const raw = await response.json();
    const day = normalizeDay(area, dateStr, raw);
    save(key, day);
    return { ...day, fromCache: false };
  } catch (err) {
    if (cached?.hours?.length) {
      // Offline or API down: fall back to whatever we have.
      return { ...cached, fromCache: true, stale: true, error: err };
    }
    throw err;
  }
}

function normalizeDay(area, dateStr, raw) {
  const hours = raw
    .map((r) => ({
      hour: hourFromIso(r.time_start),
      start: r.time_start,
      end: r.time_end,
      price: Number(r.DKK_per_kWh),
    }))
    .filter((h) => Number.isFinite(h.price))
    .sort((a, b) => a.start.localeCompare(b.start));
  return { area, date: dateStr, hours, fetchedAt: new Date().toISOString() };
}

/** Remove cached price days older than `keepDays` days before `todayStr`. */
export function pruneOldPrices(todayStr, keepDays = 7) {
  const cutoff = addDays(todayStr, -keepDays);
  for (const key of keysWithPrefix('prices.')) {
    const date = key.split('.').pop();
    if (date < cutoff) remove(key);
  }
}

/**
 * Hourly weather forecast – reserved for the future price forecast model.
 * Not used by the UI yet.
 */
export async function getWeatherForecast({ latitude = 56.15, longitude = 10.2, days = 5 } = {}) {
  const url =
    `${WEATHER_BASE}?latitude=${latitude}&longitude=${longitude}` +
    '&hourly=temperature_2m,wind_speed_10m,wind_speed_100m,shortwave_radiation,cloud_cover' +
    `&timezone=Europe%2FCopenhagen&forecast_days=${days}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json();
}
