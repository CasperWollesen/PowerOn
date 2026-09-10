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

/**
 * Merge consecutive hours with the same level into periods.
 * @returns {Array<{ level, start, end, avg, min, max, hours }>}
 */
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
export function actionableHours(classifiedHours, { nowHour = null } = {}) {
  return classifiedHours.filter((h) => h.inWindow && (nowHour === null || h.hour >= nowHour));
}
