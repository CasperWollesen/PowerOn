// Import of the owner's own measurements (inverter or Eloverblik CSV). Pure (LAB-01):
// text in, hourly values out. Nothing here is stored or sent anywhere (LAB-12).

import { danishInstant, HOUR_MS } from './model.js';
import { nowInDenmark } from '../js/time.js';

export const ROLES = Object.freeze([
  'ignore', 'pv', 'load', 'import', 'export', 'gridNet', 'charge', 'discharge', 'batteryNet', 'soc',
]);
export const UNITS = Object.freeze(['kWh', 'Wh', 'kW', 'W', '%']);

// Header words per role, Danish, English and German (Fronius Solar.web speaks all three).
const ROLE_WORDS = [
  ['soc', /state of charge|\bsoc\b|ladetilstand|ladezustand|opladningsniveau|batteriniveau/i],
  ['discharge', /discharg|afladet|aflad|entlad/i],
  ['charge', /charg|opladet|opladning|ladung|geladen/i],
  ['export', /feed.?in|export|einspeis|til net|solgt|salg|udlæg|produktion til/i],
  ['import', /purchas|import|bezug|fra net|købt|forbrug fra net|netzbezug/i],
  ['pv', /produc|produktion|erzeug|\bpv\b|solar|solcelle/i],
  ['load', /consum|forbrug|verbrauch|\bload\b|husforbrug/i],
];

/** Split CSV text into rows. Handles quotes, BOM, `sep=` lines and ; , or tab. */
// @req LAB-12
export function parseCsv(text) {
  let body = text.replace(/^﻿/, '');
  let delimiter = null;
  const sep = body.match(/^sep=(.)\r?\n/i);
  if (sep) {
    delimiter = sep[1];
    body = body.slice(sep[0].length);
  }
  const firstLines = body.split(/\r?\n/).slice(0, 20).join('\n');
  if (!delimiter) {
    const counts = [';', '\t', ','].map((d) => [d, firstLines.split(d).length]);
    delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return { delimiter, rows };
}

/** '1.234,5' / '1,234.5' / '1234,5' / '-0.3' → number, or NaN. */
export function parseNumber(text) {
  let s = String(text ?? '').trim().replace(/\s| /g, '');
  if (!s || s === '-' || s === '–') return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  return /^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

/**
 * A timestamp → absolute ms. Danish wall-clock unless it carries an offset or Z.
 * Accepts 2026-10-01 13:00, 2026-10-01T13:00:00+02:00, 01-10-2026 13:00,
 * 01.10.2026 13:00 and 01/10/2026 13:00 (day first).
 */
export function parseTimestamp(text) {
  const s = String(text ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2})[:.](\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  let date;
  let hour = 0;
  let minute = 0;
  if (m) {
    date = `${m[1]}-${m[2]}-${m[3]}`;
    hour = Number(m[4] ?? 0);
    minute = Number(m[5] ?? 0);
    if (m[7]) return Date.parse(`${date}T${String(hour).padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}${m[7].length === 5 ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : m[7]}`);
  } else {
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:[ T,]+(?:kl\.?\s*)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/i);
    if (!m) return NaN;
    date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    hour = Number(m[4] ?? 0);
    minute = Number(m[5] ?? 0);
  }
  if (hour > 24 || minute > 59) return NaN;
  return danishInstant(date, hour, minute);
}

/** Unit from a header such as 'Production [kWh]' or 'Battery (W)'. */
function unitFromHeader(header) {
  if (/%/.test(header)) return '%';
  if (/kwh/i.test(header)) return 'kWh';
  if (/\bwh\b|\[wh\]|\(wh\)/i.test(header)) return 'Wh';
  if (/\bkw\b|\[kw\]|\(kw\)/i.test(header)) return 'kW';
  if (/\bw\b|\[w\]|\(w\)/i.test(header)) return 'W';
  return 'kWh';
}

/**
 * Read a parsed CSV: find the header row and the time column, and guess a role and
 * unit for every other column. The result is what the mapping form edits.
 */
// @req LAB-12
export function describeCsv(name, parsed) {
  const { rows } = parsed;
  let headerAt = rows.findIndex((r, i) => r.length > 1 && rows[i + 1] && r.filter((c) => Number.isNaN(parseNumber(c))).length >= 2
    && Number.isFinite(parseTimestamp(rows[i + 1].find((c) => Number.isFinite(parseTimestamp(c))) ?? '')));
  if (headerAt < 0) headerAt = 0;
  const header = rows[headerAt] ?? [];
  const data = rows.slice(headerAt + 1);
  const sample = data.slice(0, 50);
  const timeColumn = header.findIndex((_, c) => sample.filter((r) => Number.isFinite(parseTimestamp(r[c]))).length >= Math.max(1, sample.length * 0.8));
  const columns = header.map((title, c) => {
    const numeric = sample.filter((r) => Number.isFinite(parseNumber(r[c]))).length >= Math.max(1, sample.length * 0.8);
    let role = 'ignore';
    if (c !== timeColumn && numeric) role = ROLE_WORDS.find(([, re]) => re.test(title))?.[0] ?? 'ignore';
    return { index: c, title: title || `Column ${c + 1}`, numeric: numeric && c !== timeColumn, role, unit: role === 'soc' ? '%' : unitFromHeader(title), invert: false };
  });
  return { name, headerAt, timeColumn, intervalEnd: false, columns, rows: data.length, data };
}

/**
 * Sum the mapped columns of several described files into Danish clock hours.
 * Returns Map<hourStartMs, { pv?, load?, import?, export?, charge?, discharge?, soc? }>.
 * kW/W values are averages over each row's interval; % is state of charge.
 */
// @req LAB-12
export function toHourly(files) {
  const hours = new Map();
  for (const file of files) {
    if (file.timeColumn < 0) continue;
    const mapped = file.columns.filter((c) => c.role !== 'ignore');
    if (!mapped.length) continue;
    const stamps = repeatedHourAware(file.data.map((r) => parseTimestamp(r[file.timeColumn])));
    const interval = medianInterval(stamps);
    stamps.forEach((stamp, rowIndex) => {
      if (!Number.isFinite(stamp)) return;
      const start = file.intervalEnd ? stamp - interval : stamp;
      const hourStart = Math.floor(start / HOUR_MS) * HOUR_MS;
      const slot = hours.get(hourStart) ?? {};
      for (const col of mapped) {
        let v = parseNumber(file.data[rowIndex][col.index]);
        if (!Number.isFinite(v)) continue;
        if (col.invert) v = -v;
        if (col.role === 'soc') {
          slot.soc = v;
          continue;
        }
        const kwh = col.unit === 'Wh' ? v / 1000 : col.unit === 'kW' ? (v * interval) / HOUR_MS
          : col.unit === 'W' ? (v * interval) / HOUR_MS / 1000 : v;
        addRole(slot, col.role, kwh);
      }
      hours.set(hourStart, slot);
    });
  }
  return hours;
}

// Net columns split into their two directions, so later steps see one shape.
function addRole(slot, role, kwh) {
  if (role === 'gridNet') {
    add(slot, kwh >= 0 ? 'import' : 'export', Math.abs(kwh));
    add(slot, kwh >= 0 ? 'export' : 'import', 0);
  } else if (role === 'batteryNet') {
    add(slot, kwh >= 0 ? 'discharge' : 'charge', Math.abs(kwh));
    add(slot, kwh >= 0 ? 'charge' : 'discharge', 0);
  } else add(slot, role, kwh);
}

function add(slot, key, value) {
  slot[key] = (slot[key] ?? 0) + value;
}

// In the repeated autumn hour local timestamps run backwards once; move those rows
// one hour on so the two 02:00 hours stay apart.
function repeatedHourAware(stamps) {
  const out = [...stamps];
  let last = -Infinity;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) continue;
    if (out[i] <= last && out[i] + HOUR_MS > last && nowInDenmark(new Date(out[i] + HOUR_MS)).hour === nowInDenmark(new Date(out[i])).hour) {
      out[i] += HOUR_MS;
    }
    last = out[i];
  }
  return out;
}

function medianInterval(stamps) {
  const gaps = [];
  for (let i = 1; i < stamps.length && gaps.length < 500; i++) {
    const gap = stamps[i] - stamps[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return HOUR_MS;
  gaps.sort((a, b) => a - b);
  return Math.min(HOUR_MS * 24, gaps[Math.floor(gaps.length / 2)]);
}

/**
 * Complete each imported hour from the energy balance:
 * load = pv + import − export − charge + discharge. Battery flows from the change in
 * state of charge when only SoC is known.
 */
// @req LAB-12
export function completeHours(imported, { capacityKwh, etaC, etaD }) {
  const keys = [...imported.keys()].sort((a, b) => a - b);
  let previous = null;
  for (const t of keys) {
    const h = imported.get(t);
    if (h.charge === undefined && h.discharge === undefined && h.soc !== undefined && previous?.soc !== undefined
      && previous.t === t - HOUR_MS) {
      const dE = ((h.soc - previous.soc) / 100) * capacityKwh;
      h.charge = dE > 0 ? dE / etaC : 0;
      h.discharge = dE < 0 ? -dE * etaD : 0;
      h.batteryFromSoc = true;
    }
    if (h.load === undefined && h.pv !== undefined && h.import !== undefined && h.export !== undefined) {
      h.load = Math.max(0, h.pv + h.import - h.export - (h.charge ?? 0) + (h.discharge ?? 0));
      h.loadDerived = true;
    }
    previous = { t, soc: h.soc };
  }
  return imported;
}

/** What the import covers inside the simulated hours. */
export function coverage(imported, hours) {
  const c = { hours: 0, pv: 0, load: 0, grid: 0, battery: 0, soc: 0, first: null, last: null };
  for (const h of hours) {
    const v = imported.get(h.t);
    if (!v) continue;
    c.hours += 1;
    if (v.pv !== undefined) c.pv += 1;
    if (v.load !== undefined) c.load += 1;
    if (v.import !== undefined && v.export !== undefined) c.grid += 1;
    if (v.charge !== undefined || v.discharge !== undefined) c.battery += 1;
    if (v.soc !== undefined) c.soc += 1;
    c.first ??= h.date;
    c.last = h.date;
  }
  return c;
}

/**
 * Rows like a strategy's for what really happened: grid import and export priced
 * with the same buy and sell prices. Hours without grid data are not priced.
 */
// @req LAB-12
export function actualRows(imported, hours, prices, { wear, etaD }) {
  return hours.map((h, i) => {
    const v = imported.get(h.t) ?? {};
    const known = v.import !== undefined && v.export !== undefined && prices.priced[i] === 1;
    const importKwh = known ? v.import : 0;
    const exportKwh = known ? v.export : 0;
    const delivered = known ? v.discharge ?? 0 : 0;
    return {
      priced: known,
      dE: -delivered / etaD,
      importKwh,
      exportKwh,
      cost: importKwh * prices.buy[i],
      revenue: exportKwh * prices.sell[i],
      wear: delivered * wear,
      pv: v.pv ?? 0,
      load: v.load ?? 0,
      gridToBat: 0,
      batToGrid: 0,
      buy: prices.buy[i],
      sell: prices.sell[i],
      soc: v.soc,
      charge: v.charge,
      discharge: v.discharge,
    };
  });
}
