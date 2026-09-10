// Phase 1: feasibility test of direct browser access (CORS) to the APIs.
// This file is throwaway test code; the real app modules come later.

const PRICE_AREA = 'DK1';

// Aarhus – a reasonable default location for DK1 (West Denmark).
const LATITUDE = 56.15;
const LONGITUDE = 10.2;

/** Format a Date as YYYY-MM-DD (local time). */
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildEndpoints() {
  const today = new Date();
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  const start = toDateString(today);
  const end = toDateString(dayAfterTomorrow);
  const filter = encodeURIComponent(JSON.stringify({ PriceArea: [PRICE_AREA] }));

  return {
    // Energinet Energi Data Service – current day-ahead dataset (15-minute resolution since Oct 2025).
    electricity:
      'https://api.energidataservice.dk/dataset/DayAheadPrices' +
      `?start=${start}&end=${end}&filter=${filter}&sort=TimeDK%20asc`,

    // Energinet Energi Data Service – legacy hourly dataset (may be discontinued).
    electricityLegacy:
      'https://api.energidataservice.dk/dataset/Elspotprices' +
      `?start=${start}&end=${end}&filter=${filter}&sort=HourDK%20asc`,

    // Open-Meteo hourly forecast: temperature, wind and solar radiation
    // (candidate inputs for a future price forecast model).
    weather:
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      '&hourly=temperature_2m,wind_speed_10m,shortwave_radiation' +
      '&timezone=Europe%2FCopenhagen&forecast_days=3',
  };
}

function render(cardId, { ok, error, sample }) {
  const card = document.getElementById(cardId);
  const status = card.querySelector('.status');
  status.textContent = ok ? 'OK' : 'FAILED';
  status.className = `status ${ok ? 'ok' : 'failed'}`;
  card.querySelector('.error').textContent = error ?? '';
  const pre = card.querySelector('.sample');
  if (sample) {
    pre.textContent = sample;
    pre.hidden = false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function testEndpoint(cardId, label, url, describe) {
  document.querySelector(`#${cardId} .endpoint`).textContent = url;
  console.group(`[${label}] ${url}`);
  try {
    const data = await fetchJson(url);
    const summary = describe(data);
    console.log('OK');
    console.log('Raw response:', data);
    console.log('Sample:', summary);
    render(cardId, { ok: true, sample: summary });
  } catch (err) {
    // A CORS block surfaces in the browser as a TypeError ("Failed to fetch" / "NetworkError").
    const isLikelyCors = err instanceof TypeError;
    const hint = isLikelyCors
      ? '\n(TypeError on fetch usually means a CORS block or network failure – check the console/network tab)'
      : '';
    console.error('FAILED', err);
    render(cardId, { ok: false, error: `${err.name}: ${err.message}${hint}` });
  } finally {
    console.groupEnd();
  }
}

function describeDayAheadPrices(data) {
  const records = data.records ?? [];
  const lines = [`records: ${records.length} (total: ${data.total})`];
  const first = records[0];
  if (first) lines.push(`fields: ${Object.keys(first).join(', ')}`);
  for (const r of records.slice(0, 4)) {
    lines.push(`${r.TimeDK}  ${r.PriceArea}  ${(r.DayAheadPriceDKK / 1000).toFixed(3)} kr./kWh  (${r.DayAheadPriceDKK} DKK/MWh)`);
  }
  const last = records[records.length - 1];
  if (last) lines.push(`...\nlast: ${last.TimeDK}  ${(last.DayAheadPriceDKK / 1000).toFixed(3)} kr./kWh`);
  return lines.join('\n');
}

function describeElspotprices(data) {
  const records = data.records ?? [];
  const lines = [`records: ${records.length} (total: ${data.total})`];
  const first = records[0];
  if (first) lines.push(`fields: ${Object.keys(first).join(', ')}`);
  for (const r of records.slice(0, 4)) {
    lines.push(`${r.HourDK}  ${r.PriceArea}  ${(r.SpotPriceDKK / 1000).toFixed(3)} kr./kWh  (${r.SpotPriceDKK} DKK/MWh)`);
  }
  const last = records[records.length - 1];
  if (last) lines.push(`...\nlast: ${last.HourDK}  ${(last.SpotPriceDKK / 1000).toFixed(3)} kr./kWh`);
  return lines.join('\n');
}

function describeWeather(data) {
  const h = data.hourly ?? {};
  const count = h.time?.length ?? 0;
  const lines = [
    `location: ${data.latitude}, ${data.longitude}  tz: ${data.timezone}`,
    `hourly points: ${count}`,
  ];
  for (let i = 0; i < Math.min(4, count); i++) {
    lines.push(`${h.time[i]}  ${h.temperature_2m[i]} °C  wind ${h.wind_speed_10m[i]} km/h  solar ${h.shortwave_radiation[i]} W/m²`);
  }
  return lines.join('\n');
}

const endpoints = buildEndpoints();
console.log('PowerOn API feasibility test – endpoints:', endpoints);

await Promise.all([
  testEndpoint('electricity', 'Electricity (DayAheadPrices)', endpoints.electricity, describeDayAheadPrices),
  testEndpoint('electricity-legacy', 'Electricity (Elspotprices)', endpoints.electricityLegacy, describeElspotprices),
  testEndpoint('weather', 'Weather (Open-Meteo)', endpoints.weather, describeWeather),
]);

console.log('PowerOn API feasibility test – done.');
