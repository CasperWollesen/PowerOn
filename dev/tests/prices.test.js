// Price analysis: levels, windows, periods and factors.

import { test, expect } from './harness.js';
import { classify, stats, cheapestWindow, mostExpensiveWindow, periods, bandSummary, actionableHours, relativeFactors, ratio } from '../../js/prices.js';
import { DEFAULT_BANDS } from '../../js/bands.js';

const WINDOW = { start: 6, end: 22 };
const EDGES = DEFAULT_BANDS.full; // [0.5, 1.2, 2.0, 3.5]

/** Hours 0–23 with a given price per hour. */
function hours(prices) {
  return prices.map((price, hour) => ({ hour, price }));
}

// A day that is cheap around midday and expensive in the evening.
const DAY = hours([
  1.0, 0.9, 0.9, 0.9, 1.0, 1.1, // 00–05
  1.4, 1.6, 1.5, 1.2, 0.8, 0.6, // 06–11
  0.4, 0.3, 0.3, 0.5, 0.9, 1.4, // 12–17
  2.2, 2.6, 2.4, 1.8, 1.4, 1.2, // 18–23
]);

test('ANA-02 BAND-01', 'every hour gets its price band and knows if it is in the window', () => {
  const c = classify(DAY, WINDOW, EDGES);
  const at = (h) => c.find((x) => x.hour === h);
  expect(at(13).band).toBe('free'); // 0,30
  expect(at(16).band).toBe('cheap'); // 0,90
  expect(at(17).band).toBe('fair'); // 1,40
  expect(at(18).band).toBe('expensive'); // 2,20
  expect(at(19).band).toBe('expensive'); // 2,60 – still below the 3,50 threshold
  expect(at(13).inWindow).toBeTruthy();
  expect(at(3).inWindow).toBeFalsy();
});

test('ANA-02 BAND-05', 'the same day reads differently with other thresholds', () => {
  const tight = classify(DAY, WINDOW, [0.2, 0.5, 1.0, 1.5]);
  expect(tight.find((h) => h.hour === 13).band).toBe('cheap');
  expect(tight.find((h) => h.hour === 17).band).toBe('expensive'); // 1,40
  expect(tight.find((h) => h.hour === 19).band).toBe('extreme'); // 2,60
});

test('ANA-04', 'cheapest and most expensive consecutive windows', () => {
  const c = classify(DAY, WINDOW, EDGES).filter((h) => h.inWindow);
  const best = cheapestWindow(c, 3);
  expect(best.start).toBe(12);
  expect(best.end).toBe(15);
  expect(best.avg).toBeCloseTo(1 / 3, 3);
  expect(cheapestWindow(c, 1).start).toBe(13);
  const worst = mostExpensiveWindow(c, 3);
  expect(worst.start).toBe(18);
  expect(worst.end).toBe(21);
});

test('ANA-04', 'windows must be consecutive hours', () => {
  const gapped = [
    { hour: 6, price: 0.1 },
    { hour: 7, price: 0.1 },
    { hour: 20, price: 0.1 },
  ];
  expect(cheapestWindow(gapped, 3)).toBeNull();
  expect(cheapestWindow(gapped, 2).start).toBe(6);
});

test('ANA-05', 'consecutive hours in the same band merge into periods', () => {
  const c = classify(DAY, WINDOW, EDGES).filter((h) => h.inWindow);
  const p = periods(c);
  expect(p.every((x) => x.end > x.start)).toBeTruthy();
  expect(p.every((x) => x.band)).toBeTruthy();
  // Periods cover the window without gaps.
  expect(p[0].start).toBe(6);
  expect(p[p.length - 1].end).toBe(22);
  const summary = bandSummary(c);
  expect(summary.map((s) => s.band)).toContain('free');
  // The summary is ordered from the cheapest band upwards.
  expect(summary[0].avg).toBeLessThan(summary[summary.length - 1].avg);
});

test('ANA-03', 'only hours from now on are actionable today', () => {
  const c = classify(DAY, WINDOW, EDGES);
  expect(actionableHours(c, { nowHour: 18 }).map((h) => h.hour)).toEqual([18, 19, 20, 21]);
  expect(actionableHours(c).length).toBe(16); // whole window for tomorrow
  expect(actionableHours(c, { nowHour: 23 }).length).toBe(0);
});

test('ANA-07', 'day statistics give the lowest and highest hour', () => {
  const c = classify(DAY, WINDOW, EDGES).filter((h) => h.inWindow);
  const s = stats(c);
  expect(s.min.hour).toBe(13);
  expect(s.min.price).toBe(0.3);
  expect(s.max.hour).toBe(19);
  expect(s.max.price).toBe(2.6);
  expect(s.avg).toBeGreaterThan(0.3);
});

test('ANA-06', 'factors compare a price with the cheapest and most expensive hour', () => {
  const c = classify(DAY, WINDOW, EDGES).filter((h) => h.inWindow);
  const f = relativeFactors(0.6, c);
  expect(f.cheapest.price).toBe(0.3);
  expect(f.priciest.price).toBe(2.6);
  expect(f.vsCheapest).toBeCloseTo(2, 3);
  expect(f.vsPriciest).toBeCloseTo(0.2308, 3);
});

test('ANA-06', 'factors are skipped when they would not mean anything', () => {
  expect(ratio(1, 0.04)).toBeNull(); // reference too close to zero
  expect(ratio(-0.1, 1)).toBeNull(); // negative price
  expect(ratio(0.5, 0.25)).toBe(2);
  expect(ratio(0.44, 0.02, 0.01)).toBe(22); // costs use a scaled threshold
});
