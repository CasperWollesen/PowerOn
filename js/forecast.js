// Price outlook for the coming days, learned from recent prices and weather.
//
// Model: ridge regression per day with features
//   anchor   – average spot price of the last 14 known days (captures gas/fuel level)
//   windDk   – Danish wind capacity factor
//   windDe   – North German wind capacity factor
//   solarDk  – Danish solar radiation (kWh/m²)
//   solarDe  – German solar radiation (kWh/m²)
//   tempDk   – Danish mean temperature
//   offDay   – weekend or public holiday
// Targets (all spot, kr./kWh): average in the day window, cheapest 3 hours in
// the window, lowest and highest single hour in the window, and 24-hour average.
//
// A walk-forward backtest on a year of DK1 data (observed weather) gave:
//   window average  corr 0.80  MAE 0.13 kr./kWh
//   lowest hour     corr 0.81  MAE 0.14
//   highest hour    corr 0.57  MAE 0.30  (evening peaks are harder to predict)
// Real forecasts get less accurate with every day ahead, so the band widens.
// @req OUT-01 OUT-02 OUT-03 OUT-04

import { mean, quantile, ridgeFit, stdDev } from './stats.js';
import { isOffDay } from './holidays.js';
import { addDays } from './time.js';

export const FEATURES = [
  { key: 'anchor', label: '14-day price level' },
  { key: 'windDk', label: 'Wind Denmark' },
  { key: 'windDe', label: 'Wind North Germany' },
  { key: 'solarDk', label: 'Sun Denmark' },
  { key: 'solarDe', label: 'Sun Germany' },
  { key: 'tempDk', label: 'Temperature' },
  { key: 'offDay', label: 'Weekend / holiday' },
];

const TRAIN_MAX_DAYS = 90;
const MIN_TRAIN_ROWS = 30;
const ANCHOR_DAYS = 14;
const ANCHOR_LAG = 3;
const LAMBDA = 2;
const HORIZON_DAYS = 7;

/** Day statistics from spot hours: window average, cheapest 3 h, lowest/highest hour in window, 24 h average. */
export function daySpotStats(hours, window) {
  if (!hours?.length) return null;
  const all = hours.map((h) => h.price);
  const win = hours.filter((h) => h.hour >= window.start && h.hour < window.end).map((h) => h.price);
  if (win.length < 3) return null;
  let min3 = Infinity;
  for (let i = 0; i + 3 <= win.length; i++) min3 = Math.min(min3, (win[i] + win[i + 1] + win[i + 2]) / 3);
  return { meanWin: mean(win), min3, min1: Math.min(...win), max1: Math.max(...win), mean24: mean(all) };
}

/**
 * @param {object} input
 * @param {(date: string) => Array|null} input.spotHours  spot hours for a date (sync, from cache)
 * @param {Record<string, object>} input.weather           daily weather features by date
 * @param {{start:number,end:number}} input.window
 * @param {string} input.todayDate
 * @param {string} input.latestKnownDate                    last date with published prices
 */
export function buildForecast({ spotHours, weather, window, todayDate, latestKnownDate }) {
  // Collect known days (spot stats) for anchors and training.
  const known = new Map();
  for (let i = 0; i <= TRAIN_MAX_DAYS + ANCHOR_DAYS + ANCHOR_LAG + 10; i++) {
    const date = addDays(latestKnownDate, -i);
    const stats = daySpotStats(spotHours(date), window);
    if (stats) known.set(date, stats);
  }

  const anchorAt = (endDate) => {
    const values = [];
    for (let i = 0; i < ANCHOR_DAYS; i++) {
      const s = known.get(addDays(endDate, -i));
      if (s) values.push(s.mean24);
    }
    return values.length >= 7 ? mean(values) : null;
  };

  const featureRow = (date, anchor) => {
    const w = weather[date];
    if (!w || anchor == null) return null;
    return [anchor, w.windDk, w.windDe, w.solarDk, w.solarDe, w.tempDk, isOffDay(date) ? 1 : 0];
  };

  // Training rows, oldest first.
  const rows = [];
  for (let i = TRAIN_MAX_DAYS - 1; i >= 0; i--) {
    const date = addDays(latestKnownDate, -i);
    const target = known.get(date);
    const x = target && featureRow(date, anchorAt(addDays(date, -ANCHOR_LAG)));
    if (x) rows.push({ date, x, ...target });
  }

  const recent = [...known.entries()].filter(([d]) => d > addDays(latestKnownDate, -60)).map(([, s]) => s);
  const reference = recent.length
    ? {
        avg30: mean([...known.entries()].filter(([d]) => d > addDays(latestKnownDate, -30)).map(([, s]) => s.meanWin)),
        q10: quantile(recent.map((s) => s.meanWin), 0.1),
        q33: quantile(recent.map((s) => s.meanWin), 1 / 3),
        q67: quantile(recent.map((s) => s.meanWin), 2 / 3),
        days: recent.length,
      }
    : null;

  if (rows.length < MIN_TRAIN_ROWS) {
    return { status: 'insufficient', trainingDays: rows.length, needed: MIN_TRAIN_ROWS, knownDays: known.size, reference };
  }

  const targets = ['meanWin', 'min3', 'min1', 'max1', 'mean24'];

  // Walk-forward validation on the most recent rows: fit on earlier rows only.
  const validation = {};
  const validateCount = Math.min(21, rows.length - MIN_TRAIN_ROWS);
  for (const t of targets) {
    const errors = [];
    for (let i = rows.length - validateCount; i < rows.length; i++) {
      const train = rows.slice(0, i);
      const model = ridgeFit(train.map((r) => r.x), train.map((r) => r[t]), LAMBDA);
      errors.push(model.predict(rows[i].x) - rows[i][t]);
    }
    validation[t] = errors.length
      ? { mae: mean(errors.map(Math.abs)), sd: stdDev(errors), n: errors.length }
      : null;
  }

  const models = {};
  for (const t of targets) {
    models[t] = ridgeFit(rows.map((r) => r.x), rows.map((r) => r[t]), LAMBDA);
  }
  // In-sample fit quality for the window average.
  const fitted = rows.map((r) => models.meanWin.predict(r.x));
  const ssRes = rows.reduce((s, r, i) => s + (r.meanWin - fitted[i]) ** 2, 0);
  const ssTot = rows.reduce((s, r) => s + (r.meanWin - mean(rows.map((q) => q.meanWin))) ** 2, 0);
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;

  const anchorNow = anchorAt(latestKnownDate);
  const days = [];
  for (let i = 1; i <= HORIZON_DAYS + 1; i++) {
    const date = addDays(latestKnownDate, i);
    if (date > addDays(todayDate, HORIZON_DAYS)) break;
    const x = featureRow(date, anchorNow);
    if (!x) continue;
    const horizon = i;
    const widen = 1 + 0.12 * (horizon - 1);
    const pred = {};
    for (const t of targets) {
      // A linear model can extrapolate far below prices that actually occur (e.g. very
      // windy weekends), so keep estimates within the range seen in the training data.
      const lo = Math.min(...rows.map((r) => r[t]));
      const hi = Math.max(...rows.map((r) => r[t]));
      const clamp = (v) => Math.min(hi * 1.25, Math.max(lo, v));
      const value = clamp(models[t].predict(x));
      const sd = (validation[t]?.sd || stdDev(rows.map((r) => r[t] - models[t].predict(r.x)))) * widen;
      pred[t] = { value, low: clamp(value - sd), high: clamp(value + sd) };
    }
    // Separate models can disagree; keep lowest ≤ cheapest 3 h ≤ average ≤ highest.
    pred.min3.value = Math.min(pred.min3.value, pred.meanWin.value);
    pred.min1.value = Math.min(pred.min1.value, pred.min3.value);
    pred.max1.value = Math.max(pred.max1.value, pred.meanWin.value);
    days.push({
      date,
      horizon,
      ...pred,
      level: levelFor(pred.meanWin.value, reference),
      factorVsAvg: reference?.avg30 > 0.05 ? pred.meanWin.value / reference.avg30 : null,
      nearlyFree: pred.min3.value <= 0.05,
      weather: weather[date],
      offDay: x[6] === 1,
      contributions: contributions(models.meanWin, x),
    });
  }

  return {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    latestKnownDate,
    trainingDays: rows.length,
    trainingFrom: rows[0].date,
    trainingTo: rows[rows.length - 1].date,
    r2,
    validation,
    weights: FEATURES.map((f, j) => ({ ...f, weight: models.meanWin.weights[j] })),
    reference,
    anchor: anchorNow,
    days,
  };
}

/** Per-feature contribution (kr./kWh) relative to the training average. */
function contributions(model, x) {
  return FEATURES.map((f, j) => ({ key: f.key, label: f.label, value: (model.weights[j] * (x[j] - model.means[j])) / model.sds[j] }));
}

export function levelFor(value, reference) {
  if (!reference) return 'normal';
  if (value <= reference.q10) return 'very-cheap';
  if (value <= reference.q33) return 'cheap';
  if (value >= reference.q67) return 'expensive';
  return 'normal';
}

/** Short human descriptions of what drives a day's price. */
export function driverTags(w, offDay) {
  if (!w) return [];
  const tags = [];
  const wind = Math.max(w.windDk, (w.windDk + w.windDe) / 2);
  if (wind >= 0.5) tags.push({ icon: '💨', text: 'Very windy' });
  else if (wind >= 0.3) tags.push({ icon: '💨', text: 'Windy' });
  else if (wind < 0.12) tags.push({ icon: '🍃', text: 'Calm' });
  if (w.solarDk >= 4) tags.push({ icon: '☀️', text: 'Sunny' });
  else if (w.solarDk <= 1.2) tags.push({ icon: '☁️', text: 'Grey' });
  if (offDay) tags.push({ icon: '🛋️', text: 'Weekend' });
  return tags;
}
