// The outlook model: training, prediction, clamping and levels.

import { test, expect } from './harness.js';
import { buildForecast, daySpotStats, driverTags } from '../../js/forecast.js';
import { addDays } from '../../js/time.js';

const WINDOW = { start: 6, end: 22 };

/** Deterministic pseudo-random number in [0,1) from a string. */
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** A synthetic world where wind pushes prices down and evenings are expensive. */
function world({ days = 80, latest = '2026-09-18' } = {}) {
  const weather = {};
  const prices = new Map();
  for (let i = days; i >= -4; i--) {
    const date = addDays(latest, -i);
    const wind = seeded(date);
    weather[date] = { windDk: wind, windDe: wind * 0.9, solarDk: 2 + seeded(`s${date}`) * 3, solarDe: 3, tempDk: 12 };
    if (i < 0) continue; // future days have weather but no prices
    const level = 1.4 - 1.1 * wind;
    prices.set(
      date,
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        price: Math.max(0, level + (hour >= 17 && hour < 21 ? 0.8 : hour >= 11 && hour < 15 ? -0.5 : 0)),
      })),
    );
  }
  return { weather, spotHours: (date) => prices.get(date) ?? null, latest };
}

test('OUT-01', 'day statistics summarise a day in spot terms', () => {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, price: hour === 13 ? 0.1 : hour === 19 ? 3 : 1 }));
  const s = daySpotStats(hours, WINDOW);
  expect(s.min1).toBe(0.1);
  expect(s.max1).toBe(3);
  expect(s.min3).toBeCloseTo((1 + 0.1 + 1) / 3, 6);
  expect(s.meanWin).toBeGreaterThan(0.1);
  expect(daySpotStats([], WINDOW)).toBeNull();
});

test('OUT-01', 'the model needs enough history before it says anything', () => {
  const w = world({ days: 20 });
  const forecast = buildForecast({ spotHours: w.spotHours, weather: w.weather, window: WINDOW, todayDate: '2026-09-17', latestKnownDate: w.latest });
  expect(forecast.status).toBe('insufficient');
  expect(forecast.needed).toBe(30);
});

test('OUT-04', 'the model reports the recent price level a day can be compared with', () => {
  const w = world();
  const f = buildForecast({ spotHours: w.spotHours, weather: w.weather, window: WINDOW, todayDate: '2026-09-17', latestKnownDate: w.latest });
  expect(f.reference.days).toBeGreaterThan(20);
  expect(f.reference.avg30).toBeGreaterThan(0);
  expect(f.days[0].factorVsAvg).toBeGreaterThan(0);
});

test('OUT-01 OUT-02', 'the model trains on recent days and reports its own accuracy', () => {
  const w = world();
  const f = buildForecast({ spotHours: w.spotHours, weather: w.weather, window: WINDOW, todayDate: '2026-09-17', latestKnownDate: w.latest });
  expect(f.status).toBe('ok');
  expect(f.trainingDays).toBeGreaterThan(29);
  expect(f.r2).toBeGreaterThan(0.5); // the synthetic world is mostly wind-driven
  expect(f.validation.meanWin.n).toBeGreaterThan(0);
  expect(f.weights.find((x) => x.key === 'windDk')).toBeTruthy();
  expect(f.days.length).toBeGreaterThan(0);
});

test('OUT-03', 'windy days are predicted cheaper than calm days', () => {
  const w = world();
  // Force a windy and a calm day right after the last known day.
  const windy = addDays(w.latest, 1);
  const calm = addDays(w.latest, 2);
  w.weather[windy] = { windDk: 0.95, windDe: 0.9, solarDk: 3, solarDe: 3, tempDk: 12 };
  w.weather[calm] = { windDk: 0.02, windDe: 0.03, solarDk: 3, solarDe: 3, tempDk: 12 };
  const f = buildForecast({ spotHours: w.spotHours, weather: w.weather, window: WINDOW, todayDate: '2026-09-17', latestKnownDate: w.latest });
  const a = f.days.find((d) => d.date === windy);
  const b = f.days.find((d) => d.date === calm);
  expect(a.meanWin.value).toBeLessThan(b.meanWin.value);
});

test('OUT-03', 'estimates stay inside the range seen in training and keep their order', () => {
  const w = world();
  const extreme = addDays(w.latest, 1);
  w.weather[extreme] = { windDk: 3, windDe: 3, solarDk: 30, solarDe: 30, tempDk: 40 }; // impossible weather
  const f = buildForecast({ spotHours: w.spotHours, weather: w.weather, window: WINDOW, todayDate: '2026-09-17', latestKnownDate: w.latest });
  const d = f.days.find((x) => x.date === extreme);
  expect(d.meanWin.value).toBeGreaterThan(-0.001); // the synthetic world never goes below 0
  expect(d.min1.value).toBeLessThan(d.min3.value + 1e-9);
  expect(d.min3.value).toBeLessThan(d.meanWin.value + 1e-9);
  expect(d.meanWin.value).toBeLessThan(d.max1.value + 1e-9);
  expect(d.meanWin.low).toBeLessThan(d.meanWin.high);
});

test('OUT-09', 'driver tags describe the weather in plain words', () => {
  const tags = (w, off = false) => driverTags(w, off).map((t) => t.text);
  expect(tags({ windDk: 0.8, windDe: 0.8, solarDk: 5, solarDe: 5 })).toEqual(['Very windy', 'Sunny']);
  expect(tags({ windDk: 0.05, windDe: 0.05, solarDk: 0.5, solarDe: 1 })).toEqual(['Calm', 'Grey']);
  expect(tags({ windDk: 0.35, windDe: 0.35, solarDk: 2, solarDe: 2 }, true)).toEqual(['Windy', 'Weekend']);
  expect(driverTags(null, false)).toEqual([]);
});
