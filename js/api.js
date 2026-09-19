// Spot prices from elprisenligenu.dk (hourly, kr./kWh excl. VAT).
// The source for spot prices is isolated here; tariffs live in tariffs.js and
// weather in weather.js.
//
// Days are cached compactly in localStorage as `spot.<area>.<date>` so the app
// can show history and train the outlook model without refetching.

import { load, save, remove, keysWithPrefix } from './storage.js';
import { addDays } from './time.js';

const PRICE_BASE = 'https://www.elprisenligenu.dk/api/v1/prices';
export const HISTORY_KEEP_DAYS = 400;

export class NotPublishedError extends Error {
  constructor(date) {
    super(`Prices for ${date} are not published yet`);
    this.name = 'NotPublishedError';
    this.date = date;
  }
}

// @req DATA-01
export function priceUrl(area, dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${PRICE_BASE}/${year}/${month}-${day}_${area}.json`;
}

function cacheKey(area, dateStr) {
  return `spot.${area}.${dateStr}`;
}

/** Stored format: { d: date, a: area, t: fetchedAt, h: [[hour, price], ...] } */
function pack(day) {
  return { d: day.date, a: day.area, t: day.fetchedAt, h: day.hours.map((x) => [x.hour, x.price, x.start, x.end]) };
}

function unpack(stored) {
  if (!stored?.h?.length) return null;
  return {
    date: stored.d,
    area: stored.a,
    fetchedAt: stored.t,
    hours: stored.h.map(([hour, price, start, end]) => ({ hour, price, start, end })),
  };
}

/** Cached spot day (sync) or null. */
// @req DATA-04
export function cachedDay(area, dateStr) {
  return unpack(load(cacheKey(area, dateStr)));
}

/** Dates with cached spot prices for an area, newest first. */
export function cachedDates(area) {
  const prefix = `spot.${area}.`;
  return keysWithPrefix(prefix)
    .map((k) => k.slice(prefix.length))
    .sort()
    .reverse();
}

/**
 * Prices for one day.
 * @returns {Promise<{ area, date, hours: [{ hour, price }], fetchedAt, fromCache, stale? }>}
 * @throws {NotPublishedError} when the day is not available yet (HTTP 404)
 */
// @req DATA-01 DATA-02 DATA-04 DATA-05
export async function getDayPrices(area, dateStr, { preferCache = true, requireIntervals = false } = {}) {
  const cached = cachedDay(area, dateStr);

  // A full published day never changes – no need to refetch it.
  if (preferCache && cached?.hours?.length >= 23 && (!requireIntervals || cached.hours.every((h) => h.start && h.end))) {
    return { ...cached, fromCache: true };
  }

  try {
    const response = await fetch(priceUrl(area, dateStr), { cache: 'no-cache' });
    if (response.status === 404) throw new NotPublishedError(dateStr);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const raw = await response.json();
    const day = normalizeDay(area, dateStr, raw);
    save(cacheKey(area, dateStr), pack(day));
    return { ...day, fromCache: false };
  } catch (err) {
    if (cached?.hours?.length && !(err instanceof NotPublishedError)) {
      // Offline or API down: fall back to whatever we have.
      return { ...cached, fromCache: true, stale: true, error: err };
    }
    throw err;
  }
}

function normalizeDay(area, dateStr, raw) {
  const hours = raw
    .map((r) => ({ hour: Number(r.time_start.slice(11, 13)), start: r.time_start, end: r.time_end, price: Number(r.DKK_per_kWh) }))
    .filter((h) => Number.isFinite(h.price))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map(({ hour, price, start, end }) => ({ hour, start, end, price: Math.round(price * 100000) / 100000 }));
  return { area, date: dateStr, hours, fetchedAt: new Date().toISOString() };
}

/**
 * Fetch missing days in [fromDate, toDate] (inclusive) with limited concurrency.
 * Failures are skipped silently; the next run will try again.
 */
// @req DATA-06
export async function backfillPrices(area, fromDate, toDate, { concurrency = 4, onProgress } = {}) {
  const missing = [];
  for (let d = toDate; d >= fromDate; d = addDays(d, -1)) {
    if (!cachedDay(area, d)) missing.push(d);
  }
  let done = 0;
  const queue = [...missing];
  async function worker() {
    while (queue.length) {
      const date = queue.shift();
      try {
        await getDayPrices(area, date);
      } catch {
        // ignore – e.g. offline
      }
      done += 1;
      onProgress?.(done, missing.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  return { fetched: missing.length };
}

/** Remove cached days older than `keepDays`, plus the legacy `prices.*` cache format. */
// @req DATA-07
export function pruneOldPrices(todayStr, keepDays = HISTORY_KEEP_DAYS) {
  const cutoff = addDays(todayStr, -keepDays);
  for (const key of keysWithPrefix('spot.')) {
    if (key.split('.').pop() < cutoff) remove(key);
  }
  for (const key of keysWithPrefix('prices.')) remove(key);
}

// @req USE-01
export async function getConsumption(workerUrl, key, from, to, signal) {
  const url = new URL(workerUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['', '/'].includes(url.pathname)) throw new Error('Enter the HTTPS Worker origin without a path.');
  url.pathname = '/usage';
  url.search = new URLSearchParams({ from, to });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal });
  if (response.status === 401) throw new Error('The private app key was rejected. Check it and reconnect.');
  if (response.status === 503) throw new Error('Worker unavailable or Eloverblik busy. Check setup, wait one minute and retry.');
  if (!response.ok) throw new Error('Consumption unavailable. Check Worker setup, meter access and the selected dates.');
  const data = await response.json();
  if (!Array.isArray(data.intervals)) throw new Error('The Worker returned invalid consumption data.');
  return data;
}
