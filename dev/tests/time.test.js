// Time, holidays, weather aggregation and number formatting.

import { test, expect } from './harness.js';
import { nowInDenmark, addDays, shortDate, weekdayName, formatHour, formatHourRange } from '../../js/time.js';
import { isHoliday, isOffDay } from '../../js/holidays.js';
import { capacityFactor } from '../../js/weather.js';
import { num, numShort, kr } from '../../js/format.js';
import { priceUrl } from '../../js/api.js';
import { dayWindow } from '../../js/settings.js';
import { mean, median, quantile, stdDev, ridgeFit } from '../../js/stats.js';

test('DATA-09', 'Danish wall clock is independent of the device time zone', () => {
  // 22:30 UTC in June is 00:30 the next day in Denmark (CEST, +2).
  const t = nowInDenmark(new Date('2026-06-17T22:30:00Z'));
  expect(t.date).toBe('2026-06-18');
  expect(t.hour).toBe(0);
  expect(t.minute).toBe(30);
  // Winter time (CET, +1).
  expect(nowInDenmark(new Date('2026-01-10T23:30:00Z')).date).toBe('2026-01-11');
});

test('DATA-09', 'addDays crosses months, years and daylight saving', () => {
  expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // clocks go forward on 29 March
  expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // clocks go back on 25 October
  expect(addDays('2026-09-17', 0)).toBe('2026-09-17');
});

test('DATA-09', 'date and hour labels', () => {
  expect(shortDate('2026-09-07')).toBe('7/9');
  expect(weekdayName('2026-09-17')).toBe('Thursday');
  expect(formatHour(7)).toBe('07:00');
  expect(formatHourRange(13, 16)).toBe('13–16');
});

test('OUT-11', 'Danish public holidays follow Easter', () => {
  expect(isHoliday('2026-04-05')).toBeTruthy(); // Easter Sunday 2026
  expect(isHoliday('2026-04-03')).toBeTruthy(); // Good Friday
  expect(isHoliday('2026-05-14')).toBeTruthy(); // Ascension Day
  expect(isHoliday('2026-06-05')).toBeTruthy(); // Constitution Day
  expect(isHoliday('2026-04-07')).toBeFalsy();
  expect(isHoliday('2027-03-28')).toBeTruthy(); // Easter Sunday 2027
});

test('OUT-11', 'weekends and holidays are off days', () => {
  expect(isOffDay('2026-09-19')).toBeTruthy(); // Saturday
  expect(isOffDay('2026-09-20')).toBeTruthy(); // Sunday
  expect(isOffDay('2026-09-17')).toBeFalsy(); // Thursday
  expect(isOffDay('2026-04-03')).toBeTruthy(); // Good Friday
});

test('DATA-08', 'wind capacity factor follows the cube of the wind speed', () => {
  expect(capacityFactor(0)).toBe(0);
  expect(capacityFactor(2.9)).toBe(0); // below cut-in
  expect(capacityFactor(12)).toBe(1); // rated
  expect(capacityFactor(26)).toBe(0); // cut-out
  expect(capacityFactor(8)).toBeCloseTo((512 - 27) / 1701, 4);
  expect(capacityFactor(null)).toBe(0);
});

test('NFR-02', 'numbers use Danish formatting', () => {
  expect(num(1.5)).toBe('1,50');
  expect(num(0.255, 3)).toBe('0,255');
  expect(num(2.04, 1)).toBe('2,0');
  expect(numShort(0.3)).toBe('0,3');
  expect(kr(0.44)).toBe('0,44 kr.');
  expect(num(NaN)).toBe('–');
});

test('DATA-01', 'price URL points at the day file for the area', () => {
  expect(priceUrl('DK1', '2026-09-17')).toBe('https://www.elprisenligenu.dk/api/v1/prices/2026/09-17_DK1.json');
  expect(priceUrl('DK2', '2026-01-05')).toBe('https://www.elprisenligenu.dk/api/v1/prices/2026/01-05_DK2.json');
});

test('ANA-01', 'the day window rounds to whole hours', () => {
  expect(dayWindow({ dayStart: '06:00', dayEnd: '22:00' })).toEqual({ start: 6, end: 22 });
  expect(dayWindow({ dayStart: '06:30', dayEnd: '22:30' })).toEqual({ start: 6, end: 23 });
  expect(dayWindow({ dayStart: '08:00', dayEnd: '00:00' })).toEqual({ start: 8, end: 24 });
  expect(dayWindow({ dayStart: '10:00', dayEnd: '08:00' })).toEqual({ start: 0, end: 24 }); // end before start = all day
});

test('OUT-01', 'statistics helpers', () => {
  expect(mean([1, 2, 3])).toBe(2);
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 6);
});

test('OUT-01', 'ridge regression recovers a linear relationship', () => {
  const rows = [];
  const y = [];
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      rows.push([a, b]);
      y.push(5 + 2 * a - 3 * b);
    }
  }
  const model = ridgeFit(rows, y, 0);
  expect(model.predict([2, 1])).toBeCloseTo(5 + 4 - 3, 4);
  expect(model.predict([0, 0])).toBeCloseTo(5, 4);
});
