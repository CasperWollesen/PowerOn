import { test, expect } from './harness.js';
import {
  defaultSettings, normalizeSettings, buildHours, priceSeries, solarSeries, pvKwh, houseSeries,
  heatPumpSeries, carSeries, danishInstant, NORMAL_DEGREE_HOURS,
} from '../../battery-lab/model.js';
import { batteryConfig, hourFlows, planWindow, runStrategy, runDays, manualSellHours } from '../../battery-lab/optimizer.js';
import {
  totals, dayRanges, stepRange, shiftStep, breakEven, cumulativeSaving, dayStory, compareRuns, investment, paybackYears, perYear,
  isoWeek, dayScore, dayExtras, dayTraits, gainSource,
} from '../../battery-lab/summary.js';
import { parseCsv, parseNumber, parseTimestamp, describeCsv, toHourly, completeHours, actualRows } from '../../battery-lab/import.js';
import { monthsBetween } from '../../battery-lab/data.js';

const H = 3600000;

/** A small battery for hand-checkable cases: 10 kWh, 0–100 %, 5 kW, lossless. */
function cfgFor(overrides = {}) {
  const s = normalizeSettings({
    battery: { capacityKwh: 10, minSocPct: 0, maxSocPct: 100, startSocPct: 0, chargeKw: 5, dischargeKw: 5, chargeEff: 100, dischargeEff: 100 },
    grid: { exportKw: 10, importKw: 50 },
    strategy: { wear: 0, gridMargin: 0, stepKwh: 1, planner: 'hindsight', sellThreshold: 2 },
  });
  return { ...batteryConfig(s), ...overrides };
}

function inputs(hourly) {
  const hours = hourly.map((_, i) => ({ t: i * H, date: `2026-01-0${1 + Math.floor(i / 24)}`, hour: i % 24 }));
  return {
    hours,
    pv: Float64Array.from(hourly, (h) => h.pv ?? 0),
    load: Float64Array.from(hourly, (h) => h.load ?? 0),
    buy: Float64Array.from(hourly, (h) => h.buy ?? 1),
    sell: Float64Array.from(hourly, (h) => h.sell ?? 0.5),
    priced: Uint8Array.from(hourly, (h) => (h.priced === false ? 0 : 1)),
  };
}

test('LAB-02', 'buy price adds tariffs, tax, markup and VAT; sell price subtracts the fee; tax override applies', () => {
  const hours = [{ t: 0, date: '2026-10-01', hour: 0 }, { t: H, date: '2026-10-01', hour: 1 }];
  const buy = [{ t: 0, spot: 1, tariffs: 0.2, tax: 0.008, surcharge: 0 }];
  const sell = [{ t: 0, sell: 0.98 }];
  const p = priceSeries(hours, buy, sell, { buyMarkup: 0.05, sellFee: 0.02, taxOverride: null });
  expect(p.buy[0]).toBeCloseTo((1 + 0.2 + 0.008 + 0.05) * 1.25, 6);
  expect(p.sell[0]).toBeCloseTo(0.96, 6);
  expect(p.priced[1]).toBe(0);
  expect(p.missing).toBe(1);
  const later = priceSeries(hours, buy, sell, { buyMarkup: 0.05, sellFee: 0.02, taxOverride: 0.76 });
  expect(later.buy[0]).toBeCloseTo((1 + 0.2 + 0.76 + 0.05) * 1.25, 6);
});

test('LAB-02', 'a missing production price falls back to spot and is counted', () => {
  const p = priceSeries([{ t: 0, date: '2026-10-01', hour: 0 }], [{ t: 0, spot: 0.4, tariffs: 0, tax: 0 }], [], { buyMarkup: 0, sellFee: 0, taxOverride: null });
  expect(p.sell[0]).toBeCloseTo(0.4, 6);
  expect(p.sellFromSpot).toBe(1);
});

test('LAB-02', 'months are split on calendar boundaries', () => {
  expect(monthsBetween('2025-12-15', '2026-02-03').map((m) => `${m.first}/${m.last}`))
    .toEqual(['2025-12-01/2025-12-31', '2026-01-01/2026-01-31', '2026-02-01/2026-02-28']);
});

test('LAB-03', 'solar uses the irradiance stamped at the end of the hour and loses output when hot', () => {
  const hours = [{ t: 0, date: '2026-06-21', hour: 12 }];
  const weather = { temp: new Map([[H, 25]]), gti: [new Map([[0, 0], [H, 1000]])] };
  const solar = { arrays: [{ kwp: 10, tilt: 30, azimuth: 0 }], performanceRatio: 100, tempCoeff: -0.4 };
  const { pv } = solarSeries(hours, weather, solar);
  expect(pv[0]).toBeCloseTo(10 * (1 - 0.004 * 30), 6);
  expect(pvKwh(10, 1000, -5, 1, -0.004)).toBeCloseTo(10, 6);
  expect(pvKwh(10, 0, 20, 1, -0.004)).toBe(0);
});

test('LAB-04', 'the house profile adds up to the yearly figure over a year', () => {
  const hours = buildHours('2025-01-01', '2025-12-31');
  const total = houseSeries(hours, 5000).reduce((a, b) => a + b, 0);
  expect(Math.abs(total - 5000) / 5000).toBeLessThan(0.01);
});

test('LAB-04', 'the heat pump follows degree-hours below 17 °C', () => {
  const hours = [{ t: 0, date: '2026-01-01', hour: 0 }, { t: H, date: '2026-01-01', hour: 1 }];
  const temp = new Map([[H, 7], [2 * H, 20]]);
  const heat = heatPumpSeries(hours, NORMAL_DEGREE_HOURS, temp);
  expect(heat[0]).toBeCloseTo(10, 6);
  expect(heat[1]).toBe(0);
});

test('LAB-04', 'smart car charging fills the cheapest hours of the overnight window', () => {
  const hours = buildHours('2026-01-05', '2026-01-06');
  const buy = Float64Array.from(hours, (h) => (h.hour === 2 || h.hour === 3 ? 0.5 : 2));
  const priced = new Uint8Array(hours.length).fill(1);
  const cars = [{ kwhPerDay: 15, chargerKw: 11, plugIn: 17, ready: 7, smart: true }];
  const ev = carSeries(hours, cars, buy, priced);
  const at = (date, hour) => ev[hours.findIndex((h) => h.date === date && h.hour === hour)];
  expect(at('2026-01-06', 2)).toBe(11);
  expect(at('2026-01-06', 3)).toBe(4);
  expect(at('2026-01-05', 17)).toBe(0);
  const dumb = carSeries(hours, [{ ...cars[0], smart: false }], buy, priced);
  expect(dumb[hours.findIndex((h) => h.date === '2026-01-05' && h.hour === 17)]).toBe(11);
});

test('LAB-05', 'export above the limit curtails solar first; negative prices curtail solar', () => {
  const cfg = cfgFor({ exportKw: 3, curtail: true });
  const f = hourFlows(8, 1, 1, 0.5, 2, cfg);
  expect(f.pvToBat).toBe(2);
  expect(f.pvToGrid).toBe(3);
  expect(f.curtailed).toBe(2);
  const negative = hourFlows(8, 1, 1, -0.1, 0, cfg);
  expect(negative.exportKwh).toBe(0);
  expect(negative.curtailed).toBe(7);
});

test('LAB-05', 'grid charging may not push import over the fuse; efficiency applies both ways', () => {
  const cfg = cfgFor({ importKw: 4, etaC: 0.9, etaD: 0.8 });
  expect(hourFlows(0, 3, 1, 0.5, 1.8, cfg)).toBeNull();
  const ok = hourFlows(0, 3, 1, 0.5, 0.9, cfg);
  expect(ok.gridToBat).toBeCloseTo(1, 6);
  const out = hourFlows(0, 1, 1, 0.5, -2, cfg);
  expect(out.dout).toBeCloseTo(1.6, 6);
  expect(out.batToLoad).toBeCloseTo(1, 6);
  expect(out.batToGrid).toBeCloseTo(0.6, 6);
});

test('LAB-07', 'the optimiser buys in the cheap hour and sells in the dear one', () => {
  const inp = inputs([{ buy: 0.2, sell: 0.1 }, { buy: 3, sell: 2 }]);
  const levels = planWindow(inp, 0, 2, 0, cfgFor(), true);
  expect([...levels]).toEqual([0, 5, 0]);
});

test('LAB-07', 'margin and wear stop a trade that does not clear them, and solar-only never buys', () => {
  const inp = inputs([{ buy: 1, sell: 0.5 }, { buy: 2, sell: 1.2 }]);
  expect([...planWindow(inp, 0, 2, 0, cfgFor({ margin: 0.3 }), true)]).toEqual([0, 0, 0]);
  expect([...planWindow(inp, 0, 2, 0, cfgFor(), true)]).toEqual([0, 5, 0]);
  expect([...planWindow(inp, 0, 2, 0, cfgFor({ wear: 0.25 }), true)]).toEqual([0, 0, 0]);
  expect([...planWindow(inp, 0, 2, 0, cfgFor(), false)]).toEqual([0, 0, 0]);
});

test('LAB-07', 'unpriced hours keep the battery idle', () => {
  const inp = inputs([{ buy: 0.2, sell: 0.1, priced: false }, { buy: 1, sell: 2 }]);
  expect([...planWindow(inp, 0, 2, 5, cfgFor(), true)]).toEqual([5, 5, 0]);
});

test('LAB-07', 'the day-ahead planner sees only what is published at 13:00', () => {
  // Day 1 is flat; day 2 has a cheap night and a dear evening. Planned at 00:00 on
  // day 1 nothing is known about day 2, at 13:00 it is.
  const hourly = [];
  for (let i = 0; i < 48; i++) {
    const hour = i % 24;
    const day2 = i >= 24;
    hourly.push({ buy: day2 && hour === 3 ? 0.2 : day2 && hour === 19 ? 4 : 1.5, sell: day2 && hour === 19 ? 3 : 0.8 });
  }
  const inp = inputs(hourly);
  const rows = runStrategy(inp, cfgFor({ planner: 'dayAhead' }), 'smartGrid').rows;
  expect(rows[27].gridToBat).toBe(5);
  expect(rows[43].batToGrid).toBe(5);
  expect(rows.slice(0, 24).every((r) => r.gridToBat === 0)).toBe(true);
});

test('LAB-06 LAB-08', 'strategies keep their rules and track where sold energy came from', () => {
  const hourly = [
    { pv: 6, load: 1, buy: 1, sell: 0.3 },
    { pv: 0, load: 0, buy: 0.2, sell: 0.1 },
    { pv: 0, load: 1, buy: 3, sell: 2.5 },
  ];
  const inp = inputs(hourly);
  const cfg = cfgFor();
  const self = runStrategy(inp, cfg, 'self').rows;
  expect(self[0].pvToBat).toBe(5);
  expect(self.every((r) => r.batToGrid === 0 && r.gridToBat === 0)).toBe(true);
  const threshold = runStrategy(inp, cfg, 'threshold').rows;
  expect(threshold[2].batToGrid).toBe(4);
  const solarOnly = runStrategy(inp, cfg, 'smartSolar').rows;
  expect(solarOnly.every((r) => r.gridToBat === 0)).toBe(true);
  const grid = runStrategy(inp, cfg, 'smartGrid').rows;
  expect(grid[1].gridToBat).toBe(5);
  expect(grid[2].batToGrid).toBe(4);
  const none = runStrategy(inp, cfg, 'none').rows;
  expect(none.every((r) => r.energy === 0)).toBe(true);
  const T = (rows) => totals(rows).netWithWear;
  expect(T(grid)).toBeLessThan(T(solarOnly) - 1e-9);
  expect(T(solarOnly)).toBeLessThan(T(self) - 1e-9);
});

test('LAB-08', 'solar and grid energy mix in the battery and leave it in proportion', () => {
  const inp = inputs([
    { pv: 6, load: 1, buy: 1, sell: 0 },
    { buy: 0.2, sell: 0.1 },
    { buy: 3, sell: 3 },
    { buy: 3, sell: 3 },
  ]);
  const rows = runStrategy(inp, cfgFor(), 'smartGrid').rows;
  expect(rows[0].pvToBat).toBe(5);
  expect(rows[1].gridToBat).toBe(5);
  expect(rows[1].solarE).toBe(5);
  expect(rows[1].gridE).toBe(5);
  expect(rows[2].soldSolar).toBeCloseTo(2.5, 6);
  expect(rows[2].soldGrid).toBeCloseTo(2.5, 6);
  expect(rows[3].soldGrid).toBeCloseTo(2.5, 6);
  expect(rows[3].energy).toBeCloseTo(0, 6);
});

test('LAB-09', 'totals skip unpriced hours and count cycles of the usable range', () => {
  const rows = [
    { priced: true, cost: 2, revenue: 0, wear: 0, dE: -5, batToGrid: 5 },
    { priced: false, cost: 100, revenue: 0, wear: 0, dE: -5 },
    { priced: true, cost: 0, revenue: 3, wear: 0.5, dE: 2 },
  ];
  const t = totals(rows, 0, 3, { usable: 10 });
  expect(t.net).toBe(-1);
  expect(t.netWithWear).toBe(-0.5);
  expect(t.cycles).toBe(0.5);
  expect(t.hours).toBe(2);
  const days = [{ date: 'a', from: 0, to: 1 }, { date: 'b', from: 1, to: 3 }];
  const base = rows.map((r) => ({ ...r, cost: r.cost + 1, revenue: 0, wear: 0 }));
  expect(cumulativeSaving(days, rows, base).map((p) => p.value)).toEqual([1, 4.5]);
});

test('LAB-10', 'days follow Danish midnight and steps clip to the period', () => {
  expect(buildHours('2026-03-29', '2026-03-29').length).toBe(23);
  expect(buildHours('2026-10-25', '2026-10-25').length).toBe(25);
  const hours = buildHours('2026-09-28', '2026-10-06');
  const days = dayRanges(hours);
  expect(days.length).toBe(9);
  const week = stepRange(days, 'week', '2026-10-01');
  expect(week.first).toBe('2026-09-28');
  expect(week.last).toBe('2026-10-04');
  const month = stepRange(days, 'month', '2026-10-01');
  expect(month.first).toBe('2026-10-01');
  expect(month.last).toBe('2026-10-06');
  expect(shiftStep(days, 'month', '2026-10-03', -1)).toBe('2026-09-28');
  expect(shiftStep(days, 'week', '2026-10-05', 1)).toBeNull();
  expect(isoWeek('2026-01-15')).toBe(3);
  expect(isoWeek('2026-01-01')).toBe(1);
  expect(isoWeek('2025-12-29')).toBe(1);
  expect(isoWeek('2027-01-01')).toBe(53);
  expect(isoWeek('2026-10-01')).toBe(40);
});

test('LAB-11', 'break-even prices follow the formulas', () => {
  const cfg = { etaC: 0.95, etaD: 0.95, wear: 0.1, margin: 0.05 };
  const day = [
    { hour: 3, buy: 1, sell: 0.6, pv: 0, load: 1 },
    { hour: 12, buy: 1.5, sell: 0.4, pv: 5, load: 1 },
    { hour: 19, buy: 3, sell: 2, pv: 0, load: 1 },
  ];
  const be = breakEven(cfg, day);
  const rule = (id) => be.rules.find((r) => r.id === id);
  expect(rule('gridToGrid').need).toBeCloseTo(1.05 / 0.9025 + 0.1, 6);
  expect(rule('gridToGrid').pays).toBe(true);
  expect(rule('solarToGrid').need).toBeCloseTo(0.4 / 0.9025 + 0.1, 6);
  expect(rule('gridToHouse').later).toBe(3);
});

test('LAB-12', 'Danish and ISO numbers and timestamps are read', () => {
  expect(parseNumber('1.234,5')).toBe(1234.5);
  expect(parseNumber('1,234.5')).toBe(1234.5);
  expect(parseNumber('-0,3')).toBe(-0.3);
  expect(Number.isNaN(parseNumber('n/a'))).toBe(true);
  expect(parseTimestamp('01.10.2026 13:00')).toBe(Date.parse('2026-10-01T11:00:00Z'));
  expect(parseTimestamp('01-10-2026 00:00:00')).toBe(Date.parse('2026-09-30T22:00:00Z'));
  expect(parseTimestamp('2026-01-15T08:15')).toBe(Date.parse('2026-01-15T07:15:00Z'));
  expect(parseTimestamp('2026-10-01T13:00:00+02:00')).toBe(Date.parse('2026-10-01T11:00:00Z'));
  expect(danishInstant('2026-10-25', 2)).toBe(Date.parse('2026-10-25T00:00:00Z'));
});

test('LAB-12', 'columns are recognised, units converted and summed into hours', () => {
  const csv = 'sep=;\nDate and time;Energy | Production [Wh];Energy | Feed-in [Wh];Energy | Purchase [Wh];State of charge [%]\n'
    + '01.10.2026 12:00;1000;600;0;50\n01.10.2026 12:30;1000;400;0;55\n01.10.2026 13:00;500;0;100;54';
  const file = describeCsv('demo.csv', parseCsv(csv));
  expect(file.timeColumn).toBe(0);
  expect(file.columns.map((c) => c.role)).toEqual(['ignore', 'pv', 'export', 'import', 'soc']);
  expect(file.columns[1].unit).toBe('Wh');
  const hours = toHourly([file]);
  const noon = hours.get(Date.parse('2026-10-01T10:00:00Z'));
  expect(noon.pv).toBeCloseTo(2, 6);
  expect(noon.export).toBeCloseTo(1, 6);
  expect(noon.soc).toBe(55);
});

test('LAB-12', 'power columns become energy, net columns split, the repeated autumn hour stays apart', () => {
  const csv = 'Time,Grid power (kW),Battery (kW)\n'
    + '2026-10-25 01:00,2,-1\n2026-10-25 02:00,-4,3\n2026-10-25 02:00,1,0\n2026-10-25 03:00,1,0';
  const file = describeCsv('net.csv', parseCsv(csv));
  file.columns[1].role = 'gridNet';
  file.columns[2].role = 'batteryNet';
  const hours = toHourly([file]);
  expect(hours.size).toBe(4);
  const first = hours.get(Date.parse('2026-10-25T00:00:00Z'));
  const second = hours.get(Date.parse('2026-10-25T01:00:00Z'));
  expect(first.import).toBe(0);
  expect(first.export).toBe(4);
  expect(first.discharge).toBe(3);
  expect(second.import).toBe(1);
});

test('LAB-12', 'consumption is derived from the balance and actual hours are priced', () => {
  const t = Date.parse('2026-10-01T10:00:00Z');
  const imported = completeHours(new Map([[t, { pv: 5, import: 1, export: 3, charge: 2, discharge: 0.5 }]]), { capacityKwh: 10, etaC: 1, etaD: 1 });
  expect(imported.get(t).load).toBeCloseTo(1.5, 6);
  expect(imported.get(t).loadDerived).toBe(true);
  const hours = [{ t, date: '2026-10-01', hour: 12 }, { t: t + H, date: '2026-10-01', hour: 13 }];
  const rows = actualRows(imported, hours, { buy: [2, 2], sell: [1, 1], priced: [1, 1] }, { wear: 0.1, etaD: 1 });
  expect(rows[0].cost).toBe(2);
  expect(rows[0].revenue).toBe(3);
  expect(rows[0].wear).toBeCloseTo(0.05, 6);
  expect(rows[1].priced).toBe(false);
});

test('LAB-13', 'settings are clamped, completed and keep the lowest level below the highest', () => {
  const s = normalizeSettings({ battery: { capacityKwh: '45,5', minSocPct: 90, maxSocPct: 50 }, strategy: { planner: 'magic' }, extra: 1 });
  expect(s.battery.capacityKwh).toBe(45.5);
  expect(s.battery.maxSocPct).toBe(95);
  expect(s.strategy.planner).toBe('dayAhead');
  expect(s.extra).toBe(undefined);
  expect(normalizeSettings({ prices: { taxOverride: '' } }).prices.taxOverride).toBeNull();
  expect(normalizeSettings({ prices: { taxOverride: '0,76' } }).prices.taxOverride).toBe(0.76);
  const d = defaultSettings();
  expect(d.location.label).toBe('Horsens');
  expect(String(d.location.lat).length).toBeLessThan(6);
});

test('LAB-06 LAB-07', 'today (manual) only buys into the battery at or below the nearly-free limit', () => {
  const inp = inputs([{ buy: 0.4, sell: 0.1 }, { buy: 0.2, sell: 0.1 }, { buy: 3, sell: 2.5 }, { buy: 3, sell: 2.5 }]);
  const cfg = cfgFor({ manualBuyBelow: 0.25 });
  const manual = runStrategy(inp, cfg, 'manual').rows;
  expect(manual[0].gridToBat).toBe(0);
  expect(manual[1].gridToBat).toBe(5);
  const smart = runStrategy(inp, cfg, 'smartGrid').rows;
  expect(smart[0].gridToBat).toBe(5);
  expect(smart[1].gridToBat).toBe(5);
  expect(totals(smart).netWithWear).toBeLessThan(totals(manual).netWithWear);
});

test('LAB-06', 'no solar and no battery buys everything', () => {
  const inp = inputs([{ pv: 6, load: 1, buy: 2, sell: 0.5 }]);
  const rows = runStrategy(inp, cfgFor(), 'nothing').rows;
  expect(rows[0].importKwh).toBe(1);
  expect(rows[0].exportKwh).toBe(0);
  expect(rows[0].cost).toBe(2);
});

test('LAB-17', 'the day is told in blocks of the same action with energy, cash and level', () => {
  const inp = inputs([
    { pv: 0, load: 0, buy: 0.2, sell: 0.1 },
    { pv: 0, load: 0, buy: 0.2, sell: 0.1 },
    { pv: 0, load: 0, buy: 1, sell: 0.5 },
    { pv: 0, load: 1, buy: 3, sell: 2.5 },
    { pv: 0, load: 1, buy: 3, sell: 2.5 },
  ]);
  const rows = runStrategy(inp, cfgFor(), 'smartGrid').rows;
  const blocks = dayStory(rows, inp.hours);
  expect(blocks.map((b) => b.action)).toEqual(['buy', 'idle', 'sell']);
  expect(blocks[0].from).toBe(0);
  expect(blocks[0].to).toBe(2);
  expect(blocks[0].bought).toBe(10);
  expect(blocks[0].boughtCash).toBeCloseTo(2, 6);
  expect(blocks[2].sold).toBe(8);
  expect(blocks[2].covered).toBe(2);
  expect(blocks[2].endEnergy).toBe(0);
});

test('LAB-17', 'two runs are compared by what they bought, sold and saved', () => {
  const inp = inputs([{ buy: 0.2, sell: 0.1 }, { buy: 3, sell: 2.5 }]);
  const cfg = cfgFor();
  const base = runStrategy(inp, cfg, 'smartSolar').rows;
  const other = runStrategy(inp, cfg, 'smartGrid').rows;
  const c = compareRuns(base, other, 0, 2);
  expect(c.boughtMore).toBe(5);
  expect(c.soldMore).toBe(5);
  expect(c.other.avgBuy).toBeCloseTo(0.2, 6);
  expect(c.other.avgSell).toBeCloseTo(2.5, 6);
  expect(c.extra).toBeCloseTo(5 * 2.5 - 5 * 0.2, 6);
});

test('LAB-16', 'purchase prices add up per setup and give a simple payback', () => {
  const inv = investment(defaultSettings());
  expect(inv.kwp).toBe(15);
  expect(inv.solarOnly).toBe(15 * 2000 + 20000 + 15000 + 5000);
  expect(inv.withBattery).toBe(inv.solarOnly + 60 * 1500);
  expect(paybackYears(160000, 20000)).toBe(8);
  expect(paybackYears(1000, 0)).toBe(Infinity);
  expect(perYear(100, 73)).toBe(500);
});

test('LAB-06', 'today sells in the best hours of the day above the floor and covers the house otherwise', () => {
  const inp = inputs([
    { pv: 6, load: 1, buy: 1, sell: 0.4 },
    { pv: 0, load: 1, buy: 2, sell: 1.2 },
    { pv: 0, load: 1, buy: 3, sell: 2.5 },
    { pv: 0, load: 1, buy: 1.5, sell: 0.9 },
  ]);
  const cfg = cfgFor({ manualSellHours: 2, manualSellFloor: 1, manualBuyBelow: 0.1 });
  expect([...manualSellHours(inp, cfg)]).toEqual([0, 1, 1, 0]);
  const rows = runStrategy(inp, cfg, 'manual').rows;
  expect(rows[0].pvToBat).toBe(5);
  // The first good hour sells at full power, as a person following the rule would.
  expect(rows[1].batToLoad).toBe(1);
  expect(rows[1].batToGrid).toBe(4);
  expect(rows[2].energy).toBe(0);
  expect(rows[3].batToLoad).toBe(0);
});

test('LAB-07', 'an anchored plan starts and ends exactly at the given levels, or says it cannot', () => {
  const inp = inputs([{ buy: 0.2, sell: 0.1 }, { buy: 3, sell: 2.5 }, { buy: 1, sell: 0.5 }]);
  const plan = planWindow(inp, 0, 3, 2.3, cfgFor(), true, { anchored: true, endEnergy: 4.3 });
  expect(plan[0]).toBeCloseTo(2.3, 9);
  expect(plan[3]).toBeCloseTo(4.3, 9);
  expect(planWindow(inp, 0, 3, 0, cfgFor(), false, { anchored: true, endEnergy: 6 })).toBeNull();
});

test('LAB-07 LAB-18', 'day by day, smart control keeps the levels of today at midnight and never does worse', () => {
  const hourly = [];
  for (let i = 0; i < 48; i++) {
    const hour = i % 24;
    hourly.push({ pv: hour >= 10 && hour < 15 ? 3 : 0, load: 0.5, buy: hour < 5 ? 0.6 : hour >= 17 && hour < 21 ? 3 : 1.5, sell: hour >= 17 && hour < 21 ? 2 : 0.7 });
  }
  const inp = inputs(hourly);
  const cfg = cfgFor({ manualSellHours: 2, manualSellFloor: 1, manualBuyBelow: 0.3, step: 0.5 });
  const manual = runStrategy(inp, cfg, 'manual').rows;
  const timing = runDays(inp, cfg, manual, cfg.manualBuyBelow);
  const smart = runDays(inp, cfg, manual, true, timing);
  for (const end of [23, 47]) {
    expect(Math.abs(smart[end].energy - manual[end].energy)).toBeLessThan(0.26);
    expect(Math.abs(timing[end].energy - manual[end].energy)).toBeLessThan(0.26);
  }
  const days = dayRanges(inp.hours);
  const extras = dayExtras(days, manual, timing, smart, 25);
  for (const e of extras) {
    expect(e.timing).toBeGreaterThan(-1e-9);
    expect(e.grid).toBeGreaterThan(-1e-9);
    expect(e.extra).toBeCloseTo(e.timing + e.grid, 9);
  }
  expect(extras[0].grid).toBeGreaterThan(1);
});

test('LAB-18', 'the day score is linear up to the full amount and ignores small change', () => {
  expect(dayScore(0.15, 25)).toBe(0);
  expect(dayScore(12.5, 25)).toBe(50);
  expect(dayScore(25, 25)).toBe(100);
  expect(dayScore(80, 25)).toBe(100);
  expect(dayScore(-3, 25)).toBe(0);
});

test('LAB-19', 'a day is described by its sun against nearby days, its wind and its prices', () => {
  const hourly = [];
  for (let d = 0; d < 3; d++) {
    for (let h = 0; h < 24; h++) {
      const sunny = h >= 10 && h < 14;
      hourly.push({ pv: sunny ? [5, 3, 1][d] : 0, buy: h === 3 ? 0.4 : h === 19 ? 3 : 1.5, sell: h === 19 ? 2 : h === 13 && d === 2 ? -0.1 : 0.8 });
    }
  }
  const inp = inputs(hourly);
  inp.hours.forEach((h, i) => { h.date = `2026-01-0${1 + Math.floor(i / 24)}`; });
  const wind = new Map(inp.hours.map((h, i) => [h.t, [3, 8, 12][Math.floor(i / 24)]]));
  const traits = dayTraits(inp, dayRanges(inp.hours), wind);
  expect(traits.map((x) => x.sky)).toEqual(['sunny', 'partly sunny', 'cloudy']);
  expect(traits.map((x) => x.wind)).toEqual(['calm', 'windy', 'very windy']);
  expect(traits[0].solarKwh).toBe(20);
  expect(traits[0].minBuy).toEqual({ hour: 3, price: 0.4 });
  expect(traits[0].maxSell).toEqual({ hour: 19, price: 2 });
  expect(traits[2].negativeHours).toBe(1);
});

test('LAB-19', 'where smart software wins is the hours it buys, sells or covers more than today', () => {
  const inp = inputs([{ buy: 0.2, sell: 0.1 }, { buy: 3, sell: 2.5 }]);
  const cfg = cfgFor();
  const today = runStrategy(inp, cfg, 'smartSolar').rows;
  const smart = runStrategy(inp, cfg, 'smartGrid').rows;
  const src = gainSource(today, smart, inp.hours, 0, 2);
  expect(src.buy.kwh).toBe(5);
  expect(src.buy.avg).toBeCloseTo(0.2, 6);
  expect(src.buy.hours).toEqual([0]);
  expect(src.sell.hours).toEqual([1]);
  expect(src.cover).toBeNull();
  expect(src.store).toBeNull();
});
