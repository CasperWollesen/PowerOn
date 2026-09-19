// Standalone Cloudflare ES module. No imports or secrets in this file.
const UPSTREAM = 'https://api.eloverblik.dk/customerapi/api';
let tokenCache = null;
let tokenPending = null;

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// @req USE-01
export function validRange(from, to, today) {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  return validDate(from) && validDate(to) && from < to && to <= today && days <= 92;
}

function todayInDenmark() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date());
}

async function authorized(header, key) {
  if (!key || key.length < 43 || !header?.startsWith('Bearer ')) return false;
  const digest = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(header.slice(7)), digest(key)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

async function upstream(path, token, body) {
  const response = await fetch(`${UPSTREAM}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000), redirect: 'error', cache: 'no-store',
  });
  if (!response.ok) {
    const error = new Error('Upstream unavailable');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function accessToken(refreshToken) {
  if (tokenCache?.refresh === refreshToken && tokenCache.until > Date.now()) return tokenCache.value;
  if (!tokenPending) {
    tokenPending = upstream('/token', refreshToken).then((data) => {
      if (typeof data.result !== 'string' || !data.result) throw new Error('Invalid token response');
      tokenCache = { refresh: refreshToken, value: data.result, until: Date.now() + 23 * 3600000 };
      return data.result;
    }).finally(() => { tokenPending = null; });
  }
  return tokenPending;
}

// @req USE-01 USE-02
export function normalizeConsumption(raw, meter) {
  if (raw?.success === false || !Array.isArray(raw?.result)) throw new Error('Invalid response');
  const intervals = [];
  for (const item of raw.result) {
    if (item.id !== meter) throw new Error('Unexpected meter');
    if (item.success !== true) {
      if (item.errorCode === 30015) continue; // explicitly no available data
      throw new Error('Meter request failed');
    }
    const series = item.MyEnergyData_MarketDocument?.TimeSeries;
    if (!Array.isArray(series)) throw new Error('Missing series');
    for (const s of series) {
      if (!['A04', 'A64'].includes(s.businessType) || s['measurement_Unit.name'] !== 'KWH') {
        throw new Error('A consumption meter in kWh is required');
      }
      if (!Array.isArray(s.Period)) throw new Error('Missing periods');
      for (const period of s.Period) {
        const step = { PT1H: 3600000, PT15M: 900000 }[period.resolution];
        const start = Date.parse(period.timeInterval?.start);
        const end = Date.parse(period.timeInterval?.end);
        const absolute = [period.timeInterval?.start, period.timeInterval?.end]
          .every((value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
        if (!step || !absolute || !Number.isFinite(start) || !(end > start) || !Array.isArray(period.Point)) {
          throw new Error('Invalid interval');
        }
        for (const point of period.Point) {
          const position = Number(point.position);
          const at = start + (position - 1) * step;
          const quality = point['out_Quantity.quality'];
          if (!Number.isInteger(position) || position < 1 || at + step > end) throw new Error('Invalid position');
          if (quality === 'A02' || quality === 'A05') continue;
          const quantity = point['out_Quantity.quantity'];
          const value = typeof quantity === 'string' && quantity.trim() !== '' ? Number(quantity) : NaN;
          if (!Number.isFinite(value) || value < 0 || !['A01', 'A03', 'A04'].includes(quality)) {
            throw new Error('Invalid reading');
          }
          intervals.push({ start: new Date(at).toISOString(), end: new Date(at + step).toISOString(),
            kwh: value, estimated: quality !== 'A04' || s.businessType === 'A64' });
        }
      }
    }
  }
  intervals.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 1; i < intervals.length; i++) {
    if (Date.parse(intervals[i].start) < Date.parse(intervals[i - 1].end)) throw new Error('Overlapping readings');
  }
  return intervals;
}

// @req USE-01
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
      'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'Origin not allowed' });
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization';
    const url = new URL(request.url);
    if (url.protocol !== 'https:') return reply(400, { error: 'HTTPS required' });
    if (url.pathname !== '/usage') return reply(404, { error: 'Not found' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply(405, { error: 'Method not allowed' });
    if (!env.ELOVERBLIK_REFRESH_TOKEN || !/^\d{18}$/.test(env.ELOVERBLIK_METERING_POINT || '') ||
        !env.POWERON_APP_KEY || env.POWERON_APP_KEY.length < 43) return reply(503, { error: 'Worker setup incomplete' });
    if (!await authorized(request.headers.get('Authorization'), env.POWERON_APP_KEY)) return reply(401, { error: 'Invalid app key' });
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!validRange(from, to, todayInDenmark())) return reply(400, { error: 'Select 1–92 completed days' });
    try {
      const token = await accessToken(env.ELOVERBLIK_REFRESH_TOKEN);
      const raw = await upstream(`/meterdata/gettimeseries/${from}/${to}/Actual`, token,
        { meteringPoints: { meteringPoint: [env.ELOVERBLIK_METERING_POINT] } });
      const intervals = normalizeConsumption(raw, env.ELOVERBLIK_METERING_POINT);
      return reply(200, { intervals, fetchedAt: new Date().toISOString() });
    } catch (error) {
      if (error.status === 401) tokenCache = null;
      const limited = error.status === 429 || error.status === 503;
      if (limited) headers['Retry-After'] = '60';
      return reply(limited ? 503 : 502, { error: limited ? 'Eloverblik is busy. Wait at least one minute and retry.' :
        'Eloverblik data unavailable. Check Worker secrets, meter access and selected dates.' });
    }
  },
};
