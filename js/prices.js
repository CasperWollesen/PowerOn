// Price analysis – pure functions over arrays of { hour, price } objects.
// No DOM, no network, no storage.

import { BANDS, bandFor } from './bands.js';

/**
 * Put every hour in its price band and mark whether it is inside the day window.
 * @param {Array} hours     priced hours
 * @param {{start,end}} window
 * @param {number[]} edges  band thresholds, see js/bands.js
 */
// @req ANA-02
export function classify(hours, window, edges) {
  return hours.map((h) => ({
    ...h,
    band: bandFor(h.price, edges),
    inWindow: h.hour >= window.start && h.hour < window.end,
  }));
}

// @req ANA-07
export function stats(hours) {
  if (!hours.length) return null;
  let min = hours[0];
  let max = hours[0];
  let sum = 0;
  for (const h of hours) {
    if (h.price < min.price) min = h;
    if (h.price > max.price) max = h;
    sum += h.price;
  }
  return { min, max, avg: sum / hours.length };
}

/**
 * Cheapest run of `length` consecutive hours (consecutive by hour number).
 * @returns {{ start, end, avg, hours } | null}
 */
// @req ANA-04
export function cheapestWindow(hours, length) {
  if (hours.length < length) return null;
  let best = null;
  for (let i = 0; i + length <= hours.length; i++) {
    const slice = hours.slice(i, i + length);
    if (slice[length - 1].hour - slice[0].hour !== length - 1) continue; // not consecutive
    const avg = slice.reduce((s, h) => s + h.price, 0) / length;
    if (!best || avg < best.avg) {
      best = { start: slice[0].hour, end: slice[0].hour + length, avg, hours: slice };
    }
  }
  return best;
}

/** Most expensive run of `length` consecutive hours. */
export function mostExpensiveWindow(hours, length) {
  if (hours.length < length) return null;
  let worst = null;
  for (let i = 0; i + length <= hours.length; i++) {
    const slice = hours.slice(i, i + length);
    if (slice[length - 1].hour - slice[0].hour !== length - 1) continue;
    const avg = slice.reduce((s, h) => s + h.price, 0) / length;
    if (!worst || avg > worst.avg) {
      worst = { start: slice[0].hour, end: slice[0].hour + length, avg, hours: slice };
    }
  }
  return worst;
}

/**
 * Merge consecutive hours in the same band into periods.
 * @returns {Array<{ band, start, end, avg, min, max, hours }>}
 */
// @req ANA-05
export function periods(hours) {
  const out = [];
  for (const h of hours) {
    const last = out[out.length - 1];
    if (last && last.band === h.band && last.end === h.hour) {
      last.hours.push(h);
      last.end = h.hour + 1;
    } else {
      out.push({ band: h.band, start: h.hour, end: h.hour + 1, hours: [h] });
    }
  }
  for (const p of out) {
    const s = stats(p.hours);
    p.avg = s.avg;
    p.min = s.min.price;
    p.max = s.max.price;
  }
  return out;
}

/** Summary per band: average price and the periods where that band occurs. */
export function bandSummary(hours) {
  const ps = periods(hours);
  return BANDS.map(({ id }) => {
    const own = ps.filter((p) => p.band === id);
    if (!own.length) return null;
    const all = own.flatMap((p) => p.hours);
    return { band: id, avg: stats(all).avg, periods: own, hourCount: all.length };
  }).filter(Boolean);
}

/** The period the given hour belongs to, or null. */
export function periodAt(periodList, hour) {
  return periodList.find((p) => hour >= p.start && hour < p.end) ?? null;
}

/**
 * Hours the user can still act on: inside the day window and, for today,
 * not in the past.
 */
// @req ANA-03
export function actionableHours(classifiedHours, { nowHour = null } = {}) {
  return classifiedHours.filter((h) => h.inWindow && (nowHour === null || h.hour >= nowHour));
}

/**
 * How the price compares with the cheapest and most expensive of `hours`.
 * Returns null factors when the reference is too close to zero (or negative)
 * for a ratio to mean anything.
 */
// @req ANA-06 DAY-03
export function relativeFactors(price, hours) {
  if (!hours.length) return { vsCheapest: null, vsPriciest: null, cheapest: null, priciest: null };
  const s = stats(hours);
  return {
    cheapest: s.min,
    priciest: s.max,
    vsCheapest: ratio(price, s.min.price),
    vsPriciest: ratio(price, s.max.price),
  };
}

/**
 * value / reference, or null when not meaningful (reference close to zero or negative).
 * `minReference` defaults to 0,05 kr./kWh; pass a scaled value when comparing costs.
 */
export function ratio(value, reference, minReference = 0.05) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference < minReference || value < 0) return null;
  return value / reference;
}
