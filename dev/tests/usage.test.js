import { test, expect } from './harness.js';
import { analyseUsage } from '../../js/usage.js';
import { danishMidnight, addDays } from '../../js/time.js';
import { applyPriceModel } from '../../js/tariffs.js';
import { bandEdges } from '../../js/bands.js';
import { renderUsageView } from '../../js/usage-view.js';
import { getConsumption } from '../../js/api.js';

const start = Date.parse('2026-09-01T00:00:00Z');
const iso = (hour) => new Date(start + hour * 3600000).toISOString();
const reading = (h, kwh = 1, duration = 1) => ({ start: iso(h), end: iso(h + duration), kwh, estimated: false });
const price = (h, value, duration = 1) => ({ start: iso(h), end: iso(h + duration), price: value });
const edges = [0.5, 1.2, 2, 3.5];

test('USE-02', 'all five bands conserve consumption and signed costs, missing prices stay unpriced', () => {
  const r = analyseUsage(Array.from({ length: 6 }, (_, h) => reading(h, 2)),
    [-0.1, 0.5, 1.2, 2, 3.5].map((p, h) => price(h, p)), edges, start, start + 6 * 3600000);
  expect(r.total).toBe(12);
  expect(r.unpriced).toBe(2);
  expect(r.bands.map((b) => b.kwh)).toEqual([2, 2, 2, 2, 2]);
  expect(r.bands[0].cost).toBeCloseTo(-0.2);
  expect(r.cost).toBeCloseTo(14.2);
  expect(r.highShare).toBeCloseTo(100 / 3);
  expect(r.significant).toBe(true);
});

test('USE-02', 'quarter readings and quarter prices split hourly energy without duplicating it', () => {
  const r = analyseUsage([reading(0, 4)], [price(0, 0, 0.25), price(0.25, 1, 0.25), price(0.5, 2, 0.25), price(0.75, 4, 0.25)], edges, start, start + 3600000);
  expect(r.total).toBe(4);
  expect(r.cost).toBe(7);
  expect(r.split).toBe(true);
  expect(r.unpriced).toBe(0);
  const quarter = analyseUsage([reading(0, 1, 0.25), reading(0.25, 2, 0.25)], [price(0, 2)], edges, start, start + 3600000);
  expect(quarter.cost).toBe(6);
  expect(quarter.coverage).toBe(50);
});

test('USE-02', 'DST days have 23 and 25 absolute hours and repeated 02:00 prices stay distinct', () => {
  for (const [date, hours] of [['2026-03-29', 23], ['2026-10-25', 25]]) {
    expect((danishMidnight(addDays(date, 1)) - danishMidnight(date)) / 3600000).toBe(hours);
  }
  const repeated = [
    { start: '2026-10-25T02:00:00+02:00', end: '2026-10-25T02:00:00+01:00', kwh: 1 },
    { start: '2026-10-25T02:00:00+01:00', end: '2026-10-25T03:00:00+01:00', kwh: 3 },
  ];
  const r = analyseUsage(repeated, repeated.map((x, i) => ({ ...x, price: i ? 4 : 0.1 })), edges,
    danishMidnight('2026-10-25'), danishMidnight('2026-10-26'));
  expect(r.bands[0].kwh).toBe(1);
  expect(r.bands[4].kwh).toBe(3);
  expect(r.cost).toBeCloseTo(12.1);
});

test('USE-02', 'zero consumption, absent prices and invalid intervals cannot create NaN totals', () => {
  const r = analyseUsage([reading(0, 0)], [], edges, start, start + 3600000);
  expect(r.highShare).toBe(0);
  expect(r.cost).toBe(0);
  expect(() => analyseUsage([reading(0), reading(0)], [], edges, start, start + 3600000)).toThrow();
  expect(() => analyseUsage([reading(0, -1)], [], edges, start, start + 3600000)).toThrow();
  expect(() => analyseUsage([reading(0)], [price(0, NaN)], edges, start, start + 3600000)).toThrow();
});

test('USE-02', 'usage classification follows shared full-price model and custom thresholds', () => {
  const settings = { priceMode: 'full', supplierSurcharge: 0.1, bands: { full: [0.1, 0.2, 0.3, 0.4] } };
  const profile = { byHour: new Map([[0, { system: 0.1, net: 0.1, tax: 0.1, grid: 0.1 }]]) };
  const prices = applyPriceModel([{ ...price(0, 0.2), hour: 0 }], settings, profile);
  const r = analyseUsage([reading(0, 2)], prices, bandEdges(settings), start, start + 3600000);
  expect(r.cost).toBeCloseTo(1.75);
  expect(r.bands[4].kwh).toBe(2);
});

test('USE-03', 'base estimate requires complete measured data and uses the weighted lower percentile', () => {
  const rows = Array.from({ length: 168 }, (_, h) => reading(h, h < 20 ? 0.1 : 1));
  const r = analyseUsage(rows, [], edges, start, start + 168 * 3600000);
  expect(r.base.kw).toBeCloseTo(0.1);
  expect(r.base.kwh).toBeCloseTo(16.8);
  expect(analyseUsage(rows.slice(1), [], edges, start, start + 168 * 3600000).base).toBeNull();
  rows[0].estimated = true;
  expect(analyseUsage(rows, [], edges, start, start + 168 * 3600000).base).toBeNull();
});

test('USE-01', 'connection HTML escapes user input and never includes the session key', () => {
  const result = renderUsageView({ usage: { status: 'idle', connected: false, key: 'fixture-key-private', url: '"><img src=x>', from: '2026-09-01', to: '2026-09-02' }, settings: {}, now: { date: '2026-09-03' } });
  expect(result.html.includes('fixture-key-private')).toBe(false);
  expect(result.html.includes('<img src=x>')).toBe(false);
  expect(result.html).toContain('&lt;img');
});

test('USE-01', 'private browser request is uncached, omits cookies/referrer and rejects unsafe URLs', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    expect(url.origin).toBe('https://worker.example.test');
    expect(url.pathname).toBe('/usage');
    expect(options.cache).toBe('no-store');
    expect(options.credentials).toBe('omit');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(options.redirect).toBe('error');
    expect(options.headers.Authorization).toBe('Bearer synthetic-key');
    return new Response(JSON.stringify({ intervals: [] }));
  };
  try {
    await getConsumption('https://worker.example.test', 'synthetic-key', '2026-01-01', '2026-01-02');
    for (const url of ['http://worker.example.test', 'https://user:pass@worker.example.test', 'https://worker.example.test/?key=value']) {
      let rejected = false;
      try { await getConsumption(url, 'synthetic-key', '2026-01-01', '2026-01-02'); } catch { rejected = true; }
      expect(rejected).toBe(true);
    }
    expect(calls).toBe(1);
  } finally { globalThis.fetch = original; }
});

test('USE-02', 'view never presents an entirely unpriced period as a free bill', () => {
  const result = renderUsageView({ usage: { status: 'ready', connected: true, intervals: [reading(0)], spots: {},
    from: '2026-09-01', to: '2026-09-01', loadedFrom: '2026-09-01', loadedTo: '2026-09-01' },
    settings: { priceMode: 'spot' }, now: { date: '2026-09-03' } });
  expect(result.html).toContain('Price breakdown unavailable');
  expect(result.html).toContain('Partial cost');
  expect(result.html).toContain('1 kWh unpriced');
});
