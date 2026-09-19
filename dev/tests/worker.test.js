import { test, expect } from './harness.js';
import worker, { normalizeConsumption, validRange } from '../../worker/worker.js';

// Explicitly synthetic credentials and readings; never real account data.
const meter = '000000000000000000';
const key = 'synthetic-test-key-'.repeat(4);
const env = { ALLOWED_ORIGIN: 'https://example.test', POWERON_APP_KEY: key,
  ELOVERBLIK_REFRESH_TOKEN: 'synthetic-refresh', ELOVERBLIK_METERING_POINT: meter };
// Browser Request strips the forbidden Origin header; model the server request.
const request = (authorization = `Bearer ${key}`, origin = env.ALLOWED_ORIGIN, method = 'GET', query = '?from=2026-01-01&to=2026-01-02') => ({ url: `https://worker.test/usage${query}`, method,
  headers: new Headers({ Origin: origin, Authorization: authorization }) });
function fixture(quality = 'A04', quantity = '1.250') {
  return { result: [{ id: meter, success: true, MyEnergyData_MarketDocument: { TimeSeries: [{
    businessType: 'A04', 'measurement_Unit.name': 'KWH', Period: [{ resolution: 'PT1H',
      timeInterval: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' },
      Point: [{ position: '1', 'out_Quantity.quantity': quantity, 'out_Quantity.quality': quality }],
    }],
  }] } }] };
}

test('USE-01', 'Worker rejects unauthenticated, wrong-origin and invalid-range requests before upstream', async () => {
  expect((await worker.fetch(request('Bearer wrong'), env)).status).toBe(401);
  expect((await worker.fetch(request(`Bearer ${key}`, 'https://other.test'), env)).status).toBe(403);
  expect((await worker.fetch(request(`Bearer ${key}`, env.ALLOWED_ORIGIN, 'POST'), env)).status).toBe(405);
  expect((await worker.fetch(request(`Bearer ${key}`, env.ALLOWED_ORIGIN, 'GET', '?from=2026-01-01&to=2026-12-31'), env)).status).toBe(400);
  expect((await worker.fetch(request(), { ...env, POWERON_APP_KEY: '' })).status).toBe(503);
});

test('USE-01', 'preflight is exact-origin and all responses disable caching', async () => {
  const response = await worker.fetch(request('', env.ALLOWED_ORIGIN, 'OPTIONS'), env);
  expect(response.status).toBe(204);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.ALLOWED_ORIGIN);
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(validRange('2026-02-30', '2026-03-05', '2026-09-19')).toBe(false);
  expect(validRange('2026-01-01', '2026-01-01', '2026-09-19')).toBe(false);
  expect(validRange('2026-01-01', '2026-04-03', '2026-09-19')).toBe(true);
});

test('USE-01 USE-02', 'Worker distinguishes measured, estimated, missing, empty and failed results', () => {
  expect(normalizeConsumption(fixture(), meter)[0].kwh).toBe(1.25);
  expect(normalizeConsumption(fixture('A03'), meter)[0].estimated).toBe(true);
  expect(normalizeConsumption(fixture('A02', null), meter)).toEqual([]);
  expect(normalizeConsumption(fixture('A05'), meter)).toEqual([]);
  expect(normalizeConsumption({ result: [{ id: meter, success: false, errorCode: 30015 }] }, meter)).toEqual([]);
  expect(() => normalizeConsumption({ result: [{ id: meter, success: false, errorCode: 20012 }] }, meter)).toThrow();
  expect(() => normalizeConsumption(fixture('A04', ''), meter)).toThrow();
  const duplicate = fixture();
  duplicate.result.push(duplicate.result[0]);
  expect(() => normalizeConsumption(duplicate, meter)).toThrow();
});

test('USE-01 USE-02', 'Worker validates units, consumption type, quarter resolution and absolute time', () => {
  const raw = fixture();
  const series = raw.result[0].MyEnergyData_MarketDocument.TimeSeries[0];
  series.Period[0].resolution = 'PT15M';
  expect(normalizeConsumption(raw, meter)[0].end).toBe('2026-01-01T00:15:00.000Z');
  series.businessType = 'A01';
  expect(() => normalizeConsumption(raw, meter)).toThrow();
  series.businessType = 'A04';
  series['measurement_Unit.name'] = 'MWH';
  expect(() => normalizeConsumption(raw, meter)).toThrow();
  series['measurement_Unit.name'] = 'KWH';
  series.Period[0].timeInterval.start = '2026-01-01T00:00:00';
  expect(() => normalizeConsumption(raw, meter)).toThrow();
});

test('USE-01', 'Worker normalizes successful upstream data without disclosing secrets or meter identity', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    expect(options.redirect).toBe('error');
    return new Response(JSON.stringify(url.endsWith('/token') ? { result: 'synthetic-access' } : fixture()));
  };
  try {
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.includes(meter)).toBe(false);
    expect(text.includes(key)).toBe(false);
    expect(text.includes('synthetic-access')).toBe(false);
    expect(JSON.parse(text).intervals[0].kwh).toBe(1.25);
    expect(calls).toBe(2);
    await worker.fetch(request(), env);
    expect(calls).toBe(3); // warm-isolate token reused
    globalThis.fetch = async () => new Response('upstream-secret-error', { status: 429 });
    const failed = await worker.fetch(request(), env);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('Retry-After')).toBe('60');
    expect((await failed.text()).includes('upstream-secret-error')).toBe(false);
  } finally { globalThis.fetch = original; }
});

test('USE-01', 'Worker separates token failures, meter access and parsing without exposing upstream payloads', async () => {
  const original = globalThis.fetch;
  const localEnv = { ...env, ELOVERBLIK_REFRESH_TOKEN: 'synthetic-diagnostic-refresh' };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ errorCode: 50001, errorText: 'synthetic-private' }), { status: 401 });
    let response = await worker.fetch(request(), localEnv);
    let data = await response.json();
    expect(data.code).toBe('TOKEN_REJECTED');
    expect(data.apiCode).toBe(50001);
    expect(data.upstreamStatus).toBe(401);
    expect(JSON.stringify(data).includes('synthetic-private')).toBe(false);

    globalThis.fetch = async (url) => new Response(JSON.stringify(url.endsWith('/token') ? { result: 'synthetic-token' } :
      { result: [{ id: meter, success: false, errorCode: 20010, errorText: 'synthetic-private' }] }));
    data = await (await worker.fetch(request(), localEnv)).json();
    expect(data.code).toBe('METER_REJECTED');
    expect(data.apiCode).toBe(20010);
    expect(JSON.stringify(data).includes(meter)).toBe(false);

    const raw = fixture();
    raw.result[0].MyEnergyData_MarketDocument.TimeSeries[0].Period[0].resolution = 'P1D';
    globalThis.fetch = async () => new Response(JSON.stringify(raw));
    data = await (await worker.fetch(request(), localEnv)).json();
    expect(data.code).toBe('DATA_RESOLUTION');

    globalThis.fetch = async () => { throw new Error('synthetic-private-network-detail'); };
    data = await (await worker.fetch(request(), localEnv)).json();
    expect(data.code).toBe('READINGS_NETWORK');
    expect(data.cause).toBe('other');
    expect(JSON.stringify(data).includes('synthetic-private')).toBe(false);
  } finally { globalThis.fetch = original; }
});
