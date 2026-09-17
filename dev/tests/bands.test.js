// Price bands: thresholds, lookup and labels.

import { test, expect } from './harness.js';
import { BANDS, DEFAULT_BANDS, bandFor, bandEdges, bandLabel, bandRange, bandRangeLabel, bandDistance, sanitizeEdges } from '../../js/bands.js';
import { bandRangeBadge, badge } from '../../js/ui.js';

const FULL = DEFAULT_BANDS.full; // [0.5, 1.2, 2.0, 3.5]

test('BAND-01', 'there are five bands from near free to extreme', () => {
  expect(BANDS.length).toBe(5);
  expect(BANDS.map((b) => b.id)).toEqual(['free', 'cheap', 'fair', 'expensive', 'extreme']);
  expect(bandLabel('free')).toBe('Near free');
  expect(bandLabel('extreme')).toBe('Extreme');
});

test('BAND-01', 'a price lands in the band its thresholds say', () => {
  expect(bandFor(0.0, FULL)).toBe('free');
  expect(bandFor(0.49, FULL)).toBe('free');
  expect(bandFor(0.5, FULL)).toBe('cheap'); // the threshold belongs to the band above
  expect(bandFor(1.19, FULL)).toBe('cheap');
  expect(bandFor(1.2, FULL)).toBe('fair');
  expect(bandFor(1.99, FULL)).toBe('fair');
  expect(bandFor(2.0, FULL)).toBe('expensive');
  expect(bandFor(3.49, FULL)).toBe('expensive');
  expect(bandFor(3.5, FULL)).toBe('extreme');
  expect(bandFor(12, FULL)).toBe('extreme');
});

test('BAND-01', 'negative prices are near free', () => {
  expect(bandFor(-0.2, FULL)).toBe('free');
});

test('BAND-05', 'thresholds differ for the full price and the spot price', () => {
  expect(bandEdges({ priceMode: 'full', bands: DEFAULT_BANDS })).toEqual(FULL);
  expect(bandEdges({ priceMode: 'spot', bands: DEFAULT_BANDS })).toEqual(DEFAULT_BANDS.spot);
  expect(bandEdges({ priceMode: 'full' })).toEqual(FULL); // falls back to the defaults
  // The same spot price is judged differently in the two modes.
  expect(bandFor(0.7, DEFAULT_BANDS.spot)).toBe('fair');
  expect(bandFor(0.7, DEFAULT_BANDS.full)).toBe('cheap');
});

test('BAND-04', 'thresholds must be four ascending positive numbers', () => {
  expect(sanitizeEdges([0.4, 1, 2, 4])).toEqual([0.4, 1, 2, 4]);
  expect(sanitizeEdges([1, 0.5, 2, 4])).toEqual(FULL); // not ascending
  expect(sanitizeEdges([0, 1, 2, 4])).toEqual(FULL); // zero
  expect(sanitizeEdges([1, 2, 3])).toEqual(FULL); // wrong length
  expect(sanitizeEdges('nonsense')).toEqual(FULL);
  expect(sanitizeEdges(null, 'spot')).toEqual(DEFAULT_BANDS.spot);
});

test('BAND-04', 'a band knows the range it covers', () => {
  expect(bandRange('free', FULL)).toEqual({ from: null, to: 0.5 });
  expect(bandRange('fair', FULL)).toEqual({ from: 1.2, to: 2 });
  expect(bandRange('extreme', FULL)).toEqual({ from: 3.5, to: null });
});

test('BAND-03', 'a day that spans bands is described from low to high', () => {
  expect(bandRangeLabel('free', 'fair')).toBe('Near free → Fair');
  expect(bandRangeLabel('cheap', 'cheap')).toBe('Cheap');
  expect(bandDistance('free', 'extreme')).toBe(4);
  expect(bandDistance('fair', 'fair')).toBe(0);
  const html = bandRangeBadge('free', 'expensive');
  expect(html).toContain('Near free');
  expect(html).toContain('Expensive');
  expect(html).toContain('band-range');
  expect(bandRangeBadge('fair', 'fair')).toBe(badge('fair'));
});

test('BAND-02', 'badges carry the band name, colour class and icon', () => {
  expect(badge('cheap')).toContain('band-cheap');
  expect(badge('cheap')).toContain('Cheap');
  expect(badge('free')).toContain('⚡');
  expect(badge('extreme')).toContain('🔥');
  expect(badge('fair', 'Fair', { icon: false })).toContain('Fair');
});
