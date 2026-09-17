// Price analysis – pure functions over arrays of { hour, price } objects.
// No DOM, no network, no storage.

export const LEVELS = ['cheap', 'normal', 'expensive'];

// Below this spread (max − min in kr./kWh) a day is considered flat and every
// hour is "normal". Avoids colouring trivial differences as cheap/expensive.
const MIN_SPREAD = 0.4;

/**
 * Classify hours as cheap / normal / expensive relative to the day window.
 * Thresholds are thirds of the spread between the cheapest and most expensive
 * hour inside the window, so "cheap" always means "cheap for this day".
 */
// @req ANA-02
export function classify(hours, window) {
  const inWindow = hours.filter((h) => h.hour >= window.start && h.hour < window.end);
  const basis = inWindow.length ? inWindow : hours;
  const prices = basis.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;

  return hours.map((h) => {
    let level = 'normal';
    if (spread >= MIN_SPREAD) {
      if (h.price <= min + spread / 3) level = 'cheap';
      else if (h.price >= min + (spread * 2) / 3) level = 'expensive';
    }
    return { ...h, level, inWindow: h.hour >= window.start && h.hour < window.end };
  });
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
 * Merge consecutive hours with the same level into periods.
 * @returns {Array<{ level, start, end, avg, min, max, hours }>}
 */
// @req ANA-05
export function periods(hours) {
  const out = [];
  for (const h of hours) {
    const last = out[out.length - 1];
    if (last && last.level === h.level && last.end === h.hour) {
      last.hours.push(h);
      last.end = h.hour + 1;
    } else {
      out.push({ level: h.level, start: h.hour, end: h.hour + 1, hours: [h] });
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

/** Summary per level: average price and the periods where that level occurs. */
export function levelSummary(hours) {
  const ps = periods(hours);
  return LEVELS.map((level) => {
    const own = ps.filter((p) => p.level === level);
    if (!own.length) return null;
    const all = own.flatMap((p) => p.hours);
    return { level, avg: stats(all).avg, periods: own, hourCount: all.length };
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
