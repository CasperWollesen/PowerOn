// Battery Lab summaries: totals over any range of hours, day/week/month steps,
// running totals, break-even rules, the day in words and payback. Pure (LAB-01).

import { addDays } from '../js/time.js';
import { hourAction } from './optimizer.js';

const SUM_FIELDS = [
  'importKwh', 'exportKwh', 'cost', 'revenue', 'wear', 'pv', 'load', 'pvToLoad', 'pvToBat', 'pvToGrid',
  'gridToLoad', 'gridToBat', 'batToLoad', 'batToGrid', 'curtailed', 'soldSolar', 'soldGrid', 'soldRevenue',
];

/**
 * Totals of rows [from, to). Only priced hours count, so a missing price never
 * becomes free power. `mask` (optional Uint8Array) limits the sum further.
 */
// @req LAB-09
export function totals(rows, from = 0, to = rows.length, { usable = 0, mask = null } = {}) {
  const t = Object.fromEntries(SUM_FIELDS.map((f) => [f, 0]));
  let hours = 0;
  let discharged = 0;
  for (let i = from; i < to; i++) {
    const r = rows[i];
    if (!r.priced || (mask && !mask[i])) continue;
    hours += 1;
    for (const f of SUM_FIELDS) t[f] += r[f] ?? 0;
    if (r.dE < 0) discharged -= r.dE;
  }
  t.hours = hours;
  t.net = t.cost - t.revenue;
  t.netWithWear = t.net + t.wear;
  t.cycles = usable > 0 ? discharged / usable : 0;
  t.cyclesPerYear = hours > 0 ? (t.cycles * 8766) / hours : 0;
  return t;
}

/** Index ranges per Danish day: [{ date, from, to }]. */
export function dayRanges(hours) {
  const ranges = [];
  hours.forEach((h, i) => {
    const last = ranges[ranges.length - 1];
    if (last && last.date === h.date) last.to = i + 1;
    else ranges.push({ date: h.date, from: i, to: i + 1 });
  });
  return ranges;
}

/** Monday of the ISO week a date belongs to. */
export function weekStart(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** ISO 8601 week number of a 'YYYY-MM-DD' date (weeks start on Monday). */
export function isoWeek(date) {
  const [y, m, d] = date.split('-').map(Number);
  const thursday = new Date(Date.UTC(y, m - 1, d));
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday - firstThursday) / 604800000);
}

/**
 * The step (day, week or month) containing `date`, clipped to the period:
 * { key, first, last, from, to, days: [dayRange] }.
 */
// @req LAB-10
export function stepRange(days, unit, date) {
  const keyOf = (d) => (unit === 'day' ? d : unit === 'week' ? weekStart(d) : d.slice(0, 7));
  const key = keyOf(date);
  const inStep = days.filter((r) => keyOf(r.date) === key);
  if (!inStep.length) return null;
  return {
    key,
    unit,
    first: inStep[0].date,
    last: inStep[inStep.length - 1].date,
    from: inStep[0].from,
    to: inStep[inStep.length - 1].to,
    days: inStep,
  };
}

/** The first date of the previous or next step, or null at the edge of the period. */
export function shiftStep(days, unit, date, direction) {
  const step = stepRange(days, unit, date);
  if (!step) return null;
  const at = days.findIndex((r) => r.date === (direction < 0 ? step.first : step.last));
  const neighbour = days[at + direction];
  if (!neighbour) return null;
  return stepRange(days, unit, neighbour.date).first;
}

/**
 * Cumulative saving against a baseline (cost incl. wear) at the end of every day:
 * [{ date, value }]. With a mask, both sides count the same hours only.
 */
// @req LAB-09
export function cumulativeSaving(days, rows, baseRows, mask = null) {
  let total = 0;
  return days.map((d) => {
    const own = totals(rows, d.from, d.to, { mask });
    const base = totals(baseRows, d.from, d.to, { mask });
    total += base.netWithWear - own.netWithWear;
    return { date: d.date, value: total };
  });
}

/** Saving of `rows` against `baseRows` over [from, to), cost incl. wear. */
export function saving(rows, baseRows, from, to, mask = null) {
  return totals(baseRows, from, to, { mask }).netWithWear - totals(rows, from, to, { mask }).netWithWear;
}

/**
 * The price needed later for each battery use to pay, with η = charge × discharge
 * efficiency, w = wear per kWh delivered and m = margin per kWh bought from the grid.
 * `day` holds the selected day's priced hours: [{ hour, buy, sell, pv, load }].
 */
// @req LAB-11
export function breakEven(cfg, day) {
  const eta = cfg.etaC * cfg.etaD;
  const w = cfg.wear;
  const m = cfg.margin;
  const priced = day.filter((h) => Number.isFinite(h.buy));
  if (!priced.length) return null;
  const cheapest = priced.reduce((a, b) => (b.buy < a.buy ? b : a));
  const dearest = priced.reduce((a, b) => (b.buy > a.buy ? b : a));
  const bestSell = priced.reduce((a, b) => (b.sell > a.sell ? b : a));
  const sunny = priced.filter((h) => h.pv > h.load);
  const solarHour = sunny.length ? sunny.reduce((a, b) => (b.sell < a.sell ? b : a)) : null;

  const gridNeeds = (cheapest.buy + m) / eta + w;
  const rules = [
    { id: 'gridToGrid', from: cheapest, to: bestSell, need: gridNeeds, later: bestSell.sell },
    { id: 'gridToHouse', from: cheapest, to: dearest, need: gridNeeds, later: dearest.buy },
  ];
  if (solarHour) {
    const solarNeeds = Math.max(0, solarHour.sell) / eta + w;
    rules.push({ id: 'solarToGrid', from: solarHour, to: bestSell, need: solarNeeds, later: bestSell.sell });
    rules.push({ id: 'solarToHouse', from: solarHour, to: dearest, need: solarNeeds, later: dearest.buy });
  }
  for (const r of rules) {
    r.gain = r.later - r.need;
    r.pays = r.gain > 0 && r.to.hour > r.from.hour;
  }
  return { eta, wear: w, margin: m, rules };
}

/** A value over `days` days scaled to a year of 365 days. */
export function perYear(value, days) {
  return days > 0 ? (value * 365) / days : 0;
}

/**
 * The day in words: consecutive hours with the same battery action as one block.
 * Each block: { action, from, to, sold, bought, stored, covered, soldCash,
 * boughtCash, coverValue, sellPrices, buyPrices, endEnergy }.
 */
// @req LAB-17
export function dayStory(rows, hours) {
  const blocks = [];
  rows.forEach((r, i) => {
    const action = hourAction(r);
    let block = blocks[blocks.length - 1];
    if (!block || block.action !== action) {
      block = {
        action, from: hours[i].hour, to: hours[i].hour + 1, sold: 0, bought: 0, stored: 0, covered: 0,
        soldCash: 0, boughtCash: 0, coverValue: 0, sellPrices: [], buyPrices: [], endEnergy: r.energy,
      };
      blocks.push(block);
    }
    block.to = hours[i].hour + 1;
    block.sold += r.batToGrid;
    block.bought += r.gridToBat;
    block.stored += r.pvToBat;
    block.covered += r.batToLoad;
    block.soldCash += r.batToGrid * r.sell;
    block.boughtCash += r.gridToBat * r.buy;
    block.coverValue += r.batToLoad * r.buy;
    if (r.batToGrid > 0.05) block.sellPrices.push(r.sell);
    if (r.gridToBat > 0.05) block.buyPrices.push(r.buy);
    block.endEnergy = r.energy;
  });
  return blocks;
}

/**
 * Why two strategies differ over the same hours: kWh bought into and sold from the
 * battery, their average prices, battery cover of the house, wear, the level at the
 * end, and the net difference (positive = `other` is cheaper than `base`).
 */
// @req LAB-17
export function compareRuns(baseRows, otherRows, from, to) {
  const side = (rows) => {
    const t = totals(rows, from, to);
    let boughtCost = 0;
    for (let i = from; i < to; i++) if (rows[i].priced) boughtCost += rows[i].gridToBat * rows[i].buy;
    return {
      ...t,
      avgBuy: t.gridToBat > 0.01 ? boughtCost / t.gridToBat : null,
      avgSell: t.batToGrid > 0.01 ? t.soldRevenue / t.batToGrid : null,
      endEnergy: rows[to - 1]?.energy ?? 0,
    };
  };
  const base = side(baseRows);
  const other = side(otherRows);
  return {
    base,
    other,
    extra: base.netWithWear - other.netWithWear,
    boughtMore: other.gridToBat - base.gridToBat,
    soldMore: other.batToGrid - base.batToGrid,
    coveredMore: other.batToLoad - base.batToLoad,
    wearMore: other.wear - base.wear,
  };
}

/**
 * Purchase prices for a new installation (incl. VAT). Panels and the inverter count
 * for solar only; the battery only with a battery; electrician and other parts for both.
 */
// @req LAB-16
export function investment(settings) {
  const i = settings.invest;
  const kwp = settings.solar.arrays.reduce((a, b) => a + b.kwp, 0);
  const parts = [
    { id: 'panels', amount: kwp * i.panelPerKwp, solar: true },
    { id: 'inverter', amount: i.inverter, solar: true },
    { id: 'battery', amount: settings.battery.capacityKwh * i.batteryPerKwh, solar: false },
    { id: 'electrician', amount: i.electrician, solar: true },
    { id: 'other', amount: i.other, solar: true },
  ];
  const solarOnly = parts.filter((p) => p.solar).reduce((a, p) => a + p.amount, 0);
  const withBattery = parts.reduce((a, p) => a + p.amount, 0);
  return { kwp, parts, solarOnly, withBattery };
}

/** Simple payback in years; Infinity when the setup saves nothing. */
// @req LAB-16
export function paybackYears(amount, savingPerYear) {
  return savingPerYear > 0 ? amount / savingPerYear : Infinity;
}
