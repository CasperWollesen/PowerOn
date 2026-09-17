// Shared UI snippets: they are plain strings, so they can be checked directly.

import { test, expect } from './harness.js';
import { priceRange, rangeTiles, factorText, factorPills, badge, segmented } from '../../js/ui.js';

test('DAY-08 HIST-02 OUT-06', 'a price range shows the lowest and the highest price', () => {
  const html = priceRange(0.32, 1.99);
  expect(html).toContain('0,32');
  expect(html).toContain('1,99');
  expect(html).toContain('class="lo"');
  expect(html).toContain('class="hi"');
  expect(priceRange(0.2, 1.7, { approx: true })).toContain('~');
  expect(priceRange(0.2, 1.7)).toBeTruthy();
});

test('DAY-08', 'the day tiles lead with the lowest and highest hour', () => {
  const html = rangeTiles({ low: { price: 0.32, hour: 14, band: 'free' }, high: { price: 1.99, hour: 20, band: 'fair' }, avg: 1.23 });
  expect(html).toContain('Lowest');
  expect(html).toContain('Near free');
  expect(html).toContain('Fair');
  expect(html).toContain('0,32');
  expect(html).toContain('14:00');
  expect(html).toContain('Highest');
  expect(html).toContain('1,99');
  expect(html).toContain('20:00');
  expect(html).toContain('6,2×'); // how much higher the peak is
  expect(html).toContain('Average');
  expect(html).toContain('1,23');
});

test('DAY-08', 'no factor is shown when the lowest price is too close to zero', () => {
  const html = rangeTiles({ low: { price: 0.01, hour: 3, band: 'free' }, high: { price: 2, hour: 19, band: 'expensive' }, avg: 1 });
  expect(html).toContain('Lowest');
  expect(html.includes('×')).toBeFalsy();
});

test('ANA-06', 'factors are formatted compactly', () => {
  expect(factorText(2.34)).toBe('2,3×');
  expect(factorText(12.5)).toBe('13×');
  expect(factorText(null)).toBe('');
});

test('DAY-03', 'the now card compares with the cheapest and the most expensive hour', () => {
  const html = factorPills({ vsCheapest: 1.8, vsPriciest: 0.4 });
  expect(html).toContain('1,8× cheapest');
  expect(html).toContain('0,4× priciest');
  expect(factorPills({ vsCheapest: 1.0, vsPriciest: 0.3 })).toContain('Cheapest');
  expect(factorPills({ vsCheapest: null, vsPriciest: null })).toBe('');
});

test('BAND-02', 'badges use the band colour class', () => {
  expect(badge('cheap')).toContain('Cheap');
  expect(badge('expensive')).toContain('band-expensive');
});

test('VIEW-01', 'the segmented control marks the active option', () => {
  const html = segmented('view-mode', [{ id: 'simple', label: 'Simple' }, { id: 'full', label: 'Full' }], 'full');
  expect(html).toContain('data-view-mode="simple"');
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain('role="radiogroup"');
});
