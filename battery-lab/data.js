// Battery Lab data: the lab's only network access (LAB-01).
//
//   stromligning.dk /api/prices             buy price parts per hour (spot, tariffs, tax)
//   stromligning.dk /api/prices/production  sell price per hour after production tariffs
//   Open-Meteo historical forecast archive  irradiance on the panel plane + air temperature
//
// Prices are fetched one calendar month per request. Completed months are kept in
// the Cache API in a compact form; weather is kept in memory for the session.

import { addDays, nowInDenmark } from '../js/time.js';
export { getGridCompanies } from '../js/tariffs.js';

const STROM = 'https://stromligning.dk/api';
const METEO = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
const CACHE_NAME = 'poweron-lab-v1';
const weatherMemo = new Map();

/** Calendar months touching [fromDate, toDate] as { month: 'YYYY-MM', first, last }. */
export function monthsBetween(fromDate, toDate) {
  const months = [];
  let first = `${fromDate.slice(0, 7)}-01`;
  while (first <= toDate) {
    const next = addDays(`${first.slice(0, 7)}-28`, 4).slice(0, 7) + '-01';
    months.push({ month: first.slice(0, 7), first, last: addDays(next, -1) });
    first = next;
  }
  return months;
}

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** JSON from a URL, compacted by `pack`; completed months come from the cache. */
async function monthJson(url, complete, pack) {
  const cache = complete ? await openCache() : null;
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return await hit.json();
    } catch {
      // fall through to the network
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`${new URL(url).pathname}: HTTP ${response.status}${body?.error ? ` – ${body.error}` : ''}`);
  }
  const packed = pack(await response.json());
  if (cache && packed.length) {
    try {
      await cache.put(url, new Response(JSON.stringify(packed), { headers: { 'content-type': 'application/json' } }));
    } catch {
      // quota or private mode: fine, we just refetch next time
    }
  }
  return packed;
}

function priceUrl(path, gridCompany, month) {
  const params = new URLSearchParams({
    supplierId: gridCompany,
    from: `${month.first}T00:00:00`,
    to: `${month.last}T23:45:00`,
    aggregation: '1h',
  });
  return `${STROM}${path}?${params}`;
}

function packBuy(raw) {
  return (raw.prices ?? []).map((p) => {
    const d = p.details ?? {};
    const tariffs = (d.transmission?.systemTariff?.value ?? 0) + (d.transmission?.netTariff?.value ?? 0)
      + (d.distribution?.value ?? 0);
    return [Date.parse(p.date), d.electricity?.value ?? 0, round(tariffs), d.electricityTax?.value ?? 0, d.surcharge?.value ?? 0];
  });
}

function packSell(raw) {
  return (raw.prices ?? []).map((p) => [Date.parse(p.date), p.price?.total ?? p.price?.value ?? 0]);
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Buy and sell prices for every hour of [fromDate, toDate].
 * @returns {Promise<{ buy: [{ t, spot, tariffs, tax, surcharge }], sell: [{ t, sell }], errors: string[] }>}
 */
// @req LAB-02
export async function loadPrices(gridCompany, fromDate, toDate, { onProgress } = {}) {
  const today = nowInDenmark().date;
  const months = monthsBetween(fromDate, toDate);
  const buy = [];
  const sell = [];
  const errors = [];
  const tasks = months.flatMap((month) => {
    const complete = month.last < today;
    return [
      () => monthJson(priceUrl('/prices', gridCompany, month), complete, packBuy)
        .then((rows) => rows.forEach(([t, spot, tariffs, tax, surcharge]) => buy.push({ t, spot, tariffs, tax, surcharge })))
        .catch((err) => errors.push(`Buy prices ${month.month}: ${err.message}`)),
      () => monthJson(priceUrl('/prices/production', gridCompany, month), complete, packSell)
        .then((rows) => rows.forEach(([t, value]) => sell.push({ t, sell: value })))
        .catch((err) => errors.push(`Sell prices ${month.month}: ${err.message}`)),
    ];
  });
  let done = 0;
  const queue = [...tasks];
  async function worker() {
    while (queue.length) {
      await queue.shift()();
      onProgress?.(++done, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
  return { buy, sell, errors };
}

/**
 * Irradiance per array plane and air temperature, stamped (ms) at the end of the
 * hour they average. Arrays with kWp 0 are skipped.
 * @returns {Promise<{ temp: Map<number, number>, gti: (Map<number, number>|null)[] }>}
 */
// @req LAB-03
export async function loadWeather(location, arrays, fromDate, toDate) {
  const gti = [];
  let temp = null;
  for (const array of arrays) {
    if (!(array.kwp > 0) && temp) {
      gti.push(null);
      continue;
    }
    const data = await weatherFor(location, array, fromDate, toDate);
    temp ??= data.temp;
    gti.push(array.kwp > 0 ? data.gti : null);
  }
  return { temp: temp ?? new Map(), gti };
}

async function weatherFor(location, array, fromDate, toDate) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: 'global_tilted_irradiance,temperature_2m',
    tilt: String(array.tilt),
    azimuth: String(array.azimuth),
    start_date: addDays(fromDate, -1),
    end_date: addDays(toDate, 1),
    timezone: 'GMT',
    timeformat: 'unixtime',
  });
  const url = `${METEO}?${params}`;
  if (weatherMemo.has(url)) return weatherMemo.get(url);
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`Weather: HTTP ${response.status}${body?.reason ? ` – ${body.reason}` : ''}`);
  }
  const raw = await response.json();
  const times = raw.hourly?.time ?? [];
  const g = raw.hourly?.global_tilted_irradiance ?? [];
  const tc = raw.hourly?.temperature_2m ?? [];
  const data = { temp: new Map(), gti: new Map() };
  times.forEach((s, i) => {
    if (Number.isFinite(g[i])) data.gti.set(s * 1000, g[i]);
    if (Number.isFinite(tc[i])) data.temp.set(s * 1000, tc[i]);
  });
  weatherMemo.set(url, data);
  return data;
}

/** The grid company at a coordinate, from stromligning.dk; null when unknown. */
export async function findGridCompany(lat, lon) {
  const response = await fetch(`${STROM}/suppliers/find?${new URLSearchParams({ lat: String(lat), long: String(lon) })}`);
  if (!response.ok) return null;
  const list = await response.json();
  return Array.isArray(list) && list[0]?.id ? list[0].id : null;
}
