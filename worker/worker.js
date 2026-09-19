// Standalone Cloudflare ES module. No imports or secrets in this file.
const UPSTREAM = 'https://api.eloverblik.dk/customerapi/api';
let tokenCache = null;
let tokenPending = null;

class UsageFailure extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function failure(code, status = null) {
  return new UsageFailure(code, status);
}

// Only documented error numbers are allowed out; upstream text may contain PII.
const API_CODES = new Set([10001, 10007, 20000, 20001, 20003, 20004, 20008, 20009,
  20010, 20011, 20012, 20013, 30000, 30001, 30002, 30003, 30004, 30008, 30010,
  30011, 30014, 30015, 30016, 30017, 30018, 40014, 50000, 50001, 50002, 50003]);

function apiFailure(stage, value, status = null) {
  const error = failure(stage === 'token' ? 'TOKEN_REJECTED' : 'METER_REJECTED', status);
  if (API_CODES.has(value)) error.apiCode = value;
  return error;
}

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
  const stage = body ? 'readings' : 'token';
  let response;
  try {
    response = await fetch(`${UPSTREAM}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    // No `cache` option: Workers with an older compatibility date throw on it.
    signal: AbortSignal.timeout(25000), redirect: 'error',
    });
  } catch (error) {
    const network = failure(stage === 'token' ? 'TOKEN_NETWORK' : 'READINGS_NETWORK');
    // Only the error class is exposed, never its message.
    network.cause = error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'TypeError' ? 'fetch' : 'other';
    throw network;
  }
  if (!response.ok) {
    if ([429, 503].includes(response.status)) throw failure('UPSTREAM_BUSY', response.status);
    // Parse only the allowlisted numeric code, never forward errorText or detail.
    const details = await response.json().catch(() => null);
    throw apiFailure(stage, details?.errorCode, response.status);
  }
  let data;
  try { data = await response.json(); } catch { throw failure(stage === 'token' ? 'TOKEN_FORMAT' : 'DATA_FORMAT'); }
  if (data?.success === false) throw apiFailure(stage, data.errorCode);
  return data;
}

async function accessToken(refreshToken) {
  if (tokenCache?.refresh === refreshToken && tokenCache.until > Date.now()) return tokenCache.value;
  if (!tokenPending) {
    tokenPending = upstream('/token', refreshToken).then((data) => {
      if (typeof data?.result !== 'string' || !data.result) throw failure('TOKEN_FORMAT');
      tokenCache = { refresh: refreshToken, value: data.result, until: Date.now() + 23 * 3600000 };
      return data.result;
    }).finally(() => { tokenPending = null; });
  }
  return tokenPending;
}

// @req USE-01 USE-02
export function normalizeConsumption(raw, meter) {
  if (raw?.success === false) throw apiFailure('readings', raw.errorCode);
  if (!Array.isArray(raw?.result)) throw failure('DATA_FORMAT');
  const intervals = [];
  for (const item of raw.result) {
    if (item.id !== meter) throw failure('DATA_METER');
    if (item.success !== true) {
      if (item.errorCode === 30015) continue; // explicitly no available data
      throw apiFailure('readings', item.errorCode);
    }
    const series = item.MyEnergyData_MarketDocument?.TimeSeries;
    if (!Array.isArray(series)) throw failure('DATA_FORMAT');
    for (const s of series) {
      if (!['A04', 'A64'].includes(s.businessType)) throw failure('DATA_TYPE');
      if (s['measurement_Unit.name'] !== 'KWH') throw failure('DATA_UNIT');
      if (!Array.isArray(s.Period)) throw failure('DATA_FORMAT');
      for (const period of s.Period) {
        const step = { PT1H: 3600000, PT15M: 900000 }[period.resolution];
        if (!step) throw failure('DATA_RESOLUTION');
        const start = Date.parse(period.timeInterval?.start);
        const end = Date.parse(period.timeInterval?.end);
        const absolute = [period.timeInterval?.start, period.timeInterval?.end]
          .every((value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
        if (!step || !absolute || !Number.isFinite(start) || !(end > start) || !Array.isArray(period.Point)) {
          throw failure('DATA_INTERVAL');
        }
        for (const point of period.Point) {
          const position = Number(point.position);
          const at = start + (position - 1) * step;
          const quality = point['out_Quantity.quality'];
          if (!Number.isInteger(position) || position < 1 || at + step > end) throw failure('DATA_POSITION');
          if (quality === 'A02' || quality === 'A05') continue;
          const quantity = point['out_Quantity.quantity'];
          const value = typeof quantity === 'string' && quantity.trim() !== '' ? Number(quantity) : NaN;
          if (!Number.isFinite(value) || value < 0 || !['A01', 'A03', 'A04'].includes(quality)) {
            throw failure('DATA_READING');
          }
          intervals.push({ start: new Date(at).toISOString(), end: new Date(at + step).toISOString(),
            kwh: value, estimated: quality !== 'A04' || s.businessType === 'A64' });
        }
      }
    }
  }
  intervals.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 1; i < intervals.length; i++) {
    if (Date.parse(intervals[i].start) < Date.parse(intervals[i - 1].end)) throw failure('DATA_OVERLAP');
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
        !env.POWERON_APP_KEY || env.POWERON_APP_KEY.length < 43) return reply(503, { error: 'Worker setup incomplete', code: 'WORKER_SETUP' });
    if (!await authorized(request.headers.get('Authorization'), env.POWERON_APP_KEY)) return reply(401, { error: 'Invalid app key' });
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!validRange(from, to, todayInDenmark())) return reply(400, { error: 'Select 1–92 completed days', code: 'DATE_RANGE' });
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
      const code = error instanceof UsageFailure ? error.code : 'WORKER_ERROR';
      return reply(limited ? 503 : 502, { error: 'Consumption unavailable', code,
        ...(API_CODES.has(error.apiCode) ? { apiCode: error.apiCode } : {}),
        ...(['timeout', 'fetch', 'other'].includes(error.cause) ? { cause: error.cause } : {}),
        ...(Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? { upstreamStatus: error.status } : {}),
      });
    }
  },
};
