// The full price model: spot + tariffs + tax + VAT.

import { test, expect } from './harness.js';
import { applyPriceModel, addOnForWindow, toDisplayPrice, NATIONAL_DEFAULTS, VAT_RATE } from '../../js/tariffs.js';

/** Tariff profile like the one tariffProfileFor() returns, with an evening peak. */
function profile({ peakGrid = 0.342632, dayGrid = 0.131782, nightGrid = 0.087854 } = {}) {
  const byHour = new Map();
  for (let h = 0; h < 24; h++) {
    const grid = h >= 17 && h < 21 ? peakGrid : h >= 6 ? dayGrid : nightGrid;
    byHour.set(h, { system: 0.072, net: 0.043, tax: 0.008, grid });
  }
  return { byHour, source: 'exact' };
}

const FULL = { priceMode: 'full', supplierSurcharge: 0 };
const SPOT = { priceMode: 'spot', supplierSurcharge: 0 };

test('PRICE-01', 'full price matches the real DK1 example from 17 September 2026', () => {
  // stromligning.dk for N1 C, 16:00: spot 0,5426 + 0,072 + 0,043 + 0,008 + 0,131782, ×1,25 = 0,997
  const [hour] = applyPriceModel([{ hour: 16, price: 0.5426 }], FULL, profile());
  expect(hour.price).toBeCloseTo(0.997, 3);
  expect(hour.spot).toBe(0.5426);
});

test('PRICE-07', 'every hour carries its own breakdown that adds up to the total', () => {
  const [hour] = applyPriceModel([{ hour: 19, price: 1.0 }], FULL, profile());
  const p = hour.parts;
  const sum = p.spot + p.system + p.net + p.tax + p.grid + p.surcharge + p.vat;
  expect(sum).toBeCloseTo(hour.price, 6);
  expect(p.vat).toBeCloseTo((hour.price / (1 + VAT_RATE)) * VAT_RATE, 6);
  expect(p.grid).toBeCloseTo(0.342632, 6); // evening peak tariff
});

test('PRICE-06', 'the supplier surcharge is added before VAT', () => {
  const [plain] = applyPriceModel([{ hour: 12, price: 1 }], FULL, profile());
  const [withFee] = applyPriceModel([{ hour: 12, price: 1 }], { ...FULL, supplierSurcharge: 0.08 }, profile());
  expect(withFee.price - plain.price).toBeCloseTo(0.08 * 1.25, 6);
});

test('PRICE-02', 'spot mode shows the raw market price', () => {
  const [hour] = applyPriceModel([{ hour: 12, price: 0.42 }], SPOT, profile());
  expect(hour.price).toBe(0.42);
  expect(hour.parts.vat).toBe(0);
  expect(hour.parts.grid).toBe(0);
});

test('PRICE-01', 'negative spot prices stay negative but still carry tariffs', () => {
  const [hour] = applyPriceModel([{ hour: 13, price: -0.2 }], FULL, profile());
  expect(hour.price).toBeCloseTo((-0.2 + 0.072 + 0.043 + 0.008 + 0.131782) * 1.25, 6);
  expect(hour.spot).toBe(-0.2);
});

test('PRICE-04', 'without tariff data the national defaults are used', () => {
  const byHour = new Map();
  const fallback = { byHour, source: 'default' };
  for (let h = 0; h < 24; h++) byHour.set(h, { ...NATIONAL_DEFAULTS, grid: 0 });
  const [hour] = applyPriceModel([{ hour: 10, price: 1 }], FULL, fallback);
  expect(hour.price).toBeCloseTo((1 + 0.072 + 0.043 + 0.008) * 1.25, 6);
});

test('OUT-05', 'add-ons for converting spot forecasts follow the tariff profile', () => {
  const addOn = addOnForWindow(FULL, profile(), { start: 6, end: 22 });
  const base = 0.072 + 0.043 + 0.008;
  expect(addOn.min1).toBeCloseTo(base + 0.131782, 6); // cheapest hour sits outside the peak
  expect(addOn.max1).toBeCloseTo(base + 0.342632, 6); // most expensive hour in the 17–21 peak
  expect(addOn.min3).toBeLessThan(addOn.max1);
  expect(addOn.avg).toBeGreaterThan(addOn.min1);
  expect(addOn.factor).toBe(1.25);
  expect(toDisplayPrice(0.5, addOn.min1, addOn.factor)).toBeCloseTo((0.5 + base + 0.131782) * 1.25, 6);
});

test('OUT-05', 'spot mode converts forecasts without tariffs or VAT', () => {
  const addOn = addOnForWindow(SPOT, profile(), { start: 6, end: 22 });
  expect(addOn.avg).toBe(0);
  expect(addOn.factor).toBe(1);
  expect(toDisplayPrice(0.5, addOn.avg, addOn.factor)).toBe(0.5);
});
