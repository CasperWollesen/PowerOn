// Danish public holidays. Demand (and therefore prices) on holidays behaves
// like a weekend, which matters for the price forecast.

import { addDays } from './time.js';

const cache = new Map();

/** Easter Sunday for a year (anonymous Gregorian algorithm) as 'YYYY-MM-DD'. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function holidaysFor(year) {
  if (cache.has(year)) return cache.get(year);
  const easter = easterSunday(year);
  const set = new Set([
    `${year}-01-01`,
    addDays(easter, -3), // Maundy Thursday
    addDays(easter, -2), // Good Friday
    easter,
    addDays(easter, 1), // Easter Monday
    addDays(easter, 39), // Ascension Day
    addDays(easter, 49), // Whit Sunday
    addDays(easter, 50), // Whit Monday
    `${year}-06-05`, // Constitution Day
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-26`,
    `${year}-12-31`,
  ]);
  cache.set(year, set);
  return set;
}

export function isHoliday(dateStr) {
  return holidaysFor(Number(dateStr.slice(0, 4))).has(dateStr);
}

/** Saturday, Sunday or a public holiday. */
// @req OUT-11
export function isOffDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6 || isHoliday(dateStr);
}
