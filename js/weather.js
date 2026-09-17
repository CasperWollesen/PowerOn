// Weather from Open-Meteo, aggregated to daily features for the price forecast
// and the history view.
//
// Wind matters most: Danish and North German wind power push DK1 prices down.
// Solar (Denmark + Germany), temperature and weekends explain much of the rest.
// Two requests cover ~92 past days and 8 forecast days.

import { load, save } from './storage.js';

const BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'weather.daily';
const MAX_AGE_MS = 3 * 3600 * 1000;
const KEEP_DAYS = 400;

// Wind power regions (hub height 100 m).
const WIND_DK = [
  { name: 'Horns Rev', lat: 55.5, lon: 7.8 },
  { name: 'Ringkøbing', lat: 56.1, lon: 8.1 },
  { name: 'Thy', lat: 57.0, lon: 8.6 },
  { name: 'Anholt', lat: 56.6, lon: 11.2 },
];
const WIND_DE = [
  { name: 'German North Sea', lat: 54.3, lon: 6.5 },
  { name: 'Schleswig-Holstein', lat: 54.4, lon: 9.3 },
  { name: 'Lower Saxony', lat: 53.0, lon: 8.5 },
  { name: 'Brandenburg', lat: 52.5, lon: 13.5 },
];
// Solar / temperature points: central Jutland, central and southern Germany.
const SUN_POINTS = [
  { name: 'Central Jutland', lat: 56.0, lon: 9.3 },
  { name: 'Central Germany', lat: 51.0, lon: 10.0 },
  { name: 'Bavaria', lat: 48.8, lon: 11.0 },
];

/** Rough wind turbine capacity factor (0–1) from wind speed in m/s. */
// @req DATA-08
export function capacityFactor(v) {
  if (v == null || v < 3 || v >= 25) return 0;
  return Math.min(1, (v ** 3 - 27) / (1728 - 27));
}

function coords(points) {
  return {
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather: HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(`Weather: ${data.reason}`);
  return Array.isArray(data) ? data : [data];
}

/** Mean capacity factor per local date across all given locations. */
function dailyWind(locations) {
  const sums = new Map();
  for (const loc of locations) {
    const { time, wind_speed_100m: speed } = loc.hourly;
    for (let i = 0; i < time.length; i++) {
      if (speed[i] == null) continue;
      const date = time[i].slice(0, 10);
      const s = sums.get(date) ?? { cf: 0, speed: 0, n: 0 };
      s.cf += capacityFactor(speed[i]);
      s.speed += speed[i];
      s.n += 1;
      sums.set(date, s);
    }
  }
  const out = new Map();
  for (const [date, s] of sums) {
    // Require most hours of the day for all locations.
    if (s.n >= locations.length * 20) out.set(date, { cf: s.cf / s.n, speed: s.speed / s.n });
  }
  return out;
}

/**
 * Daily weather features for past and coming days.
 * @returns {Promise<{ fetchedAt: number, days: Record<string, DayWeather> }>}
 *   DayWeather = { windDk, windDe, windSpeedDk, solarDk, solarDe, tempDk }
 *   wind* are capacity factors 0–1, solar* are kWh/m² per day, temp in °C.
 */
export async function getWeather({ force = false } = {}) {
  const cached = load(CACHE_KEY);
  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;

  const common = '&past_days=92&forecast_days=8&timezone=Europe%2FCopenhagen';
  const wind = coords([...WIND_DK, ...WIND_DE]);
  const sun = coords(SUN_POINTS);
  try {
    const [windData, sunData] = await Promise.all([
      fetchJson(`${BASE}?latitude=${wind.latitude}&longitude=${wind.longitude}&hourly=wind_speed_100m&wind_speed_unit=ms${common}`),
      fetchJson(`${BASE}?latitude=${sun.latitude}&longitude=${sun.longitude}&daily=shortwave_radiation_sum,temperature_2m_mean${common}`),
    ]);

    const windDk = dailyWind(windData.slice(0, WIND_DK.length));
    const windDe = dailyWind(windData.slice(WIND_DK.length));

    // shortwave_radiation_sum is MJ/m²; 3.6 MJ = 1 kWh.
    const [dk, deCenter, deSouth] = sunData.map((loc) => loc.daily);
    const days = { ...(cached?.days ?? {}) };
    dk.time.forEach((date, i) => {
      const wdk = windDk.get(date);
      const wde = windDe.get(date);
      const s1 = dk.shortwave_radiation_sum[i];
      const s2 = deCenter.shortwave_radiation_sum[i];
      const s3 = deSouth.shortwave_radiation_sum[i];
      const t = dk.temperature_2m_mean[i];
      if (!wdk || !wde || s1 == null || s2 == null || s3 == null || t == null) return;
      days[date] = {
        windDk: round(wdk.cf),
        windDe: round(wde.cf),
        windSpeedDk: round(wdk.speed, 1),
        solarDk: round(s1 / 3.6, 2),
        solarDe: round((s2 + s3) / 2 / 3.6, 2),
        tempDk: round(t, 1),
      };
    });

    // Keep the cache bounded.
    const dates = Object.keys(days).sort();
    for (const d of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete days[d];

    const result = { fetchedAt: Date.now(), days };
    save(CACHE_KEY, result);
    return result;
  } catch (err) {
    if (cached) return { ...cached, stale: true, error: err };
    throw err;
  }
}

export function cachedWeather() {
  return load(CACHE_KEY);
}

function round(v, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
