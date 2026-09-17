// Price analysis: levels, windows, periods and factors.

import { test, expect } from './harness.js';
import { classify, stats, cheapestWindow, mostExpensiveWindow, periods, levelSummary, actionableHours, relativeFactors, ratio } from '../../js/prices.js';

const WINDOW = { start: 6, end: 22 };

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

test('ANA-02', 'hours are cheap, normal or expensive relative to the day window', () => {
  const c = classify(DAY, WINDOW);
  const at = (h) => c.find((x) => x.hour === h);
  // Window min 0,3 max 2,6 → spread 2,3; cheap ≤ 1,067, expensive ≥ 1,833.
  expect(at(13).level).toBe('cheap');
  expect(at(16).level).toBe('cheap');
  expect(at(17).level).toBe('normal');
  expect(at(19).level).toBe('expensive');
  expect(at(13).inWindow).toBeTruthy();
  expect(at(3).inWindow).toBeFalsy();
});

test('ANA-02', 'a flat day has no cheap or expensive hours', () => {
  const flat = classify(hours(Array.from({ length: 24 }, (_, h) => 1 + (h % 3) * 0.1)), WINDOW);
  expect(flat.every((h) => h.level === 'normal')).toBeTruthy();
});

test('ANA-04', 'cheapest and most expensive consecutive windows', () => {
  const c = classify(DAY, WINDOW).filter((h) => h.inWindow);
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

test('ANA-05', 'consecutive hours with the same level merge into periods', () => {
  const c = classify(DAY, WINDOW).filter((h) => h.inWindow);
  const p = periods(c);
  expect(p[0].start).toBe(6);
  expect(p.every((x) => x.end > x.start)).toBeTruthy();
  // Periods cover the window without gaps.
  expect(p[0].start).toBe(6);
  expect(p[p.length - 1].end).toBe(22);
  const summary = levelSummary(c);
  expect(summary.map((s) => s.level)).toContain('cheap');
  expect(summary.find((s) => s.level === 'cheap').avg).toBeLessThan(summary.find((s) => s.level === 'expensive').avg);
});

test('ANA-03', 'only hours from now on are actionable today', () => {
  const c = classify(DAY, WINDOW);
  expect(actionableHours(c, { nowHour: 18 }).map((h) => h.hour)).toEqual([18, 19, 20, 21]);
  expect(actionableHours(c).length).toBe(16); // whole window for tomorrow
  expect(actionableHours(c, { nowHour: 23 }).length).toBe(0);
});

test('ANA-07', 'day statistics give the lowest and highest hour', () => {
  const c = classify(DAY, WINDOW).filter((h) => h.inWindow);
  const s = stats(c);
  expect(s.min.hour).toBe(13);
  expect(s.min.price).toBe(0.3);
  expect(s.max.hour).toBe(19);
  expect(s.max.price).toBe(2.6);
  expect(s.avg).toBeGreaterThan(0.3);
});

test('ANA-06', 'factors compare a price with the cheapest and most expensive hour', () => {
  const c = classify(DAY, WINDOW).filter((h) => h.inWindow);
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
