// Battery Lab charts: SVG strings sized to the container width (LAB-10, LAB-14).
// One value axis per chart; hover details come from `data-tip` on hit areas, which
// app.js shows in a tooltip. Colours are CSS variables from lab.css.

import { esc, num } from '../js/format.js';

/** Round axis limits and ticks that include both lo and hi. */
export function niceScale(lo, hi, count = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 1] };
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw - 1e-12);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min, max, ticks };
}

function tickText(v) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${num(v / 1000, abs >= 10000 ? 0 : 1)}k`;
  return num(v, abs > 0 && abs < 10 && !Number.isInteger(v) ? 1 : 0).replace(/,0$/, '');
}

function yAxis(scale, y, left, right, { zero = true } = {}) {
  return scale.ticks.map((v) => {
    const yy = y(v).toFixed(1);
    const cls = zero && Math.abs(v) < 1e-9 ? 'zero' : 'axis';
    return `<line class="${cls}" x1="${left}" x2="${right}" y1="${yy}" y2="${yy}"/>`
      + `<text x="${left - 6}" y="${yy}" dy="0.32em" text-anchor="end">${tickText(v)}</text>`;
  }).join('');
}

/** Bar with a 4px rounded data end and a square base at y0. */
function barPath(x, y0, y1, w) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, h, w / 2);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i class="${i.line ? 'line' : ''}" style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/**
 * Lines over a category axis (days). series: [{ label, color, values }].
 * tips: per x, the text shown on hover.
 */
// @req LAB-09
export function lineChart({ width, height = 230, series, labels, tips }) {
  const pad = { l: 48, r: 14, t: 10, b: 24 };
  const w = Math.max(120, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const n = labels.length;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => pad.t + ((scale.max - v) / (scale.max - scale.min)) * h;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 80))));
  const xLabels = labels.map((l, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every / 2)
    ? `<text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(l)}</text>` : '').join('');
  const lines = series.map((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const last = s.values.length - 1;
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      + (last >= 0 ? `<circle cx="${x(last).toFixed(1)}" cy="${y(s.values[last]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>` : '');
  }).join('');
  const slot = n <= 1 ? w : w / (n - 1);
  const hits = labels.map((_, i) => `<rect class="hit" x="${(x(i) - slot / 2).toFixed(1)}" y="${pad.t}" width="${slot.toFixed(1)}" height="${h}" data-tip="${esc(tips[i])}"/>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`
    + `${yAxis(scale, y, pad.l, pad.l + w)}${xLabels}${lines}${hits}</svg></div>`;
}

/**
 * One bar per category (single series), positive up, negative down.
 * bars: [{ label, value, tip, date }]; a bar with a date opens that day on click.
 */
// @req LAB-10
export function barChart({ width, height = 200, bars, color }) {
  const pad = { l: 48, r: 10, t: 10, b: 24 };
  const w = Math.max(120, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const n = bars.length;
  const values = bars.map((b) => b.value).filter(Number.isFinite);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const y = (v) => pad.t + ((scale.max - v) / (scale.max - scale.min)) * h;
  const band = w / Math.max(1, n);
  const bw = Math.min(24, Math.max(3, band - 2));
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46))));
  const marks = bars.map((b, i) => {
    const x0 = pad.l + i * band + (band - bw) / 2;
    const path = Number.isFinite(b.value) ? barPath(x0, y(0), y(b.value), bw) : '';
    const label = i % every === 0 ? `<text x="${(x0 + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(b.label)}</text>` : '';
    const action = b.date ? ` data-action="open-day" data-date="${esc(b.date)}" style="cursor:pointer"` : '';
    return `${path ? `<path d="${path}" fill="${color}"/>` : ''}${label}`
      + `<rect class="hit" x="${(pad.l + i * band).toFixed(1)}" y="${pad.t}" width="${band.toFixed(1)}" height="${h}" data-tip="${esc(b.tip)}"${action}/>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`
    + `${yAxis(scale, y, pad.l, pad.l + w)}${marks}</svg></div>`;
}

/**
 * Battery level of several strategies as lines over the day, % of capacity.
 * series: [{ color, values }] with one value per hour boundary (n + 1).
 */
// @req LAB-10
export function levelLines({ width, hours, series, minPct, tips }) {
  const pad = { l: 48, r: 10, t: 8, b: 22 };
  const height = 150;
  const w = Math.max(120, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const n = hours.length;
  const band = w / n;
  const x = (i) => pad.l + i * band;
  const scale = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
  const y = (v) => pad.t + ((scale.max - v) / (scale.max - scale.min)) * h;
  const lines = series.map((s) => `<path d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const floor = `<line class="limit" x1="${pad.l}" x2="${pad.l + w}" y1="${y(minPct).toFixed(1)}" y2="${y(minPct).toFixed(1)}"/>`;
  const hits = hours.map((_, i) => `<rect class="hit" x="${x(i).toFixed(1)}" y="${pad.t}" width="${band.toFixed(1)}" height="${h}" data-tip="${esc(tips[i])}"/>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`
    + `${yAxis(scale, y, pad.l, pad.l + w, { zero: false })}${hourAxis(hours, x, band, height)}${floor}${lines}${hits}</svg></div>`;
}

/**
 * One stacked bar per day, all parts positive: bars [{ label, parts: [{ value, color }],
 * tip, date }]. A bar with a date opens that day on click.
 */
// @req LAB-18
export function stackedBars({ width, height = 190, bars }) {
  const pad = { l: 48, r: 10, t: 10, b: 24 };
  const w = Math.max(120, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const n = bars.length;
  const sums = bars.map((b) => b.parts.reduce((a, p) => a + Math.max(0, p.value), 0));
  const scale = niceScale(0, Math.max(1, ...sums));
  const y = (v) => pad.t + ((scale.max - v) / (scale.max - scale.min)) * h;
  const band = w / Math.max(1, n);
  const bw = Math.min(24, Math.max(1, band > 4 ? band - 2 : band));
  const gap = bw >= 4 ? 1 : 0;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46))));
  const marks = bars.map((b, i) => {
    const x0 = pad.l + i * band + (band - bw) / 2;
    const parts = b.parts.filter((p) => p.value > 0.005);
    let base = 0;
    const segments = parts.map((p, j) => {
      const from = base;
      base += p.value;
      const top = j === parts.length - 1;
      const y0 = y(from) - (j > 0 ? gap : 0);
      const y1 = y(base);
      if (y0 - y1 < 0.5) return '';
      return top ? `<path d="${barPath(x0, y0, y1, bw)}" fill="${p.color}"/>`
        : `<rect x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - y1).toFixed(1)}" fill="${p.color}"/>`;
    }).join('');
    const label = i % every === 0 ? `<text x="${(x0 + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(b.label)}</text>` : '';
    const action = b.date ? ` data-action="open-day" data-date="${esc(b.date)}" style="cursor:pointer"` : '';
    return `${segments}${label}<rect class="hit" x="${(pad.l + i * band).toFixed(1)}" y="${pad.t}" width="${band.toFixed(1)}" height="${h}" data-tip="${esc(b.tip)}"${action}/>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`
    + `${yAxis(scale, y, pad.l, pad.l + w)}${marks}</svg></div>`;
}

function hourAxis(hours, x, band, height) {
  return hours.map((h, i) => (h.hour % 3 === 0 && (i === 0 || hours[i - 1].hour !== h.hour)
    ? `<text x="${(x(i) + band / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${String(h.hour).padStart(2, '0')}</text>` : '')).join('');
}

/**
 * The three day panels sharing the hour axis: prices, energy in and out of the
 * battery, and the battery level split by origin.
 * rows: the day's strategy rows; before: { solarE, gridE, startE } at midnight;
 * refs: dashed reference lines in the price panel, [{ value, color }];
 * zones: hours shaded between two prices in the price panel, [{ i, lo, hi, color }].
 */
// @req LAB-10
export function dayPanels({ width, hours, rows, before, cfg, tips, refs = [], zones = [] }) {
  const pad = { l: 48, r: 10, t: 8, b: 22 };
  const w = Math.max(120, width - pad.l - pad.r);
  const n = rows.length;
  const band = w / n;
  const bw = Math.min(24, Math.max(3, band - 4));
  const x = (i) => pad.l + i * band;
  const hits = (height, h) => rows.map((_, i) => `<rect class="hit" x="${x(i).toFixed(1)}" y="${pad.t}" width="${band.toFixed(1)}" height="${h}" data-tip="${esc(tips[i])}"/>`).join('');
  const svg = (height, body) => `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${body}</svg></div>`;

  // Prices
  const H1 = 150;
  const h1 = H1 - pad.t - pad.b;
  const shown = refs.filter((r) => Number.isFinite(r.value));
  const priceValues = [...rows.flatMap((r) => (r.priced ? [r.buy, r.sell] : [])), ...shown.map((r) => r.value)];
  const s1 = niceScale(Math.min(0, ...priceValues), Math.max(0.5, ...priceValues));
  const y1 = (v) => pad.t + ((s1.max - v) / (s1.max - s1.min)) * h1;
  const stepLine = (key, color) => {
    let d = '';
    rows.forEach((r, i) => {
      if (!r.priced) return;
      const yy = y1(r[key]).toFixed(1);
      d += `${d && rows[i - 1]?.priced ? 'L' : 'M'}${x(i).toFixed(1)},${yy}H${(x(i) + band).toFixed(1)}`;
    });
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  const shaded = zones.map((z) => {
    const top = y1(Math.max(z.lo, z.hi));
    const bottom = y1(Math.min(z.lo, z.hi));
    return `<rect class="zone" x="${x(z.i).toFixed(1)}" width="${band.toFixed(1)}" y="${top.toFixed(1)}" height="${(bottom - top).toFixed(1)}" fill="${z.color}"/>`;
  }).join('');
  const refLines = shaded + shown.map((r) => {
    const yy = y1(r.value).toFixed(1);
    return `<line class="ref" x1="${pad.l}" x2="${pad.l + w}" y1="${yy}" y2="${yy}" stroke="${r.color}"/>`;
  }).join('');
  const prices = svg(H1, yAxis(s1, y1, pad.l, pad.l + w) + hourAxis(hours, x, band, H1) + refLines
    + stepLine('buy', 'var(--c-blue)') + stepLine('sell', 'var(--c-violet)') + hits(H1, h1));

  // Energy in (up) and out (down) of the battery
  const H2 = 160;
  const h2 = H2 - pad.t - pad.b;
  const up = rows.map((r) => r.pvToBat + r.gridToBat);
  const down = rows.map((r) => r.batToLoad + r.batToGrid);
  const s2 = niceScale(-Math.max(1, ...down), Math.max(1, ...up));
  const y2 = (v) => pad.t + ((s2.max - v) / (s2.max - s2.min)) * h2;
  const stack = (i, parts, sign) => {
    let base = 0;
    return parts.map(([value, color]) => {
      if (value < 0.005) return '';
      const from = base;
      base += value;
      const gap = from > 0 ? 1 : 0;
      return `<path d="${barPath(x(i) + (band - bw) / 2, y2(sign * from) - sign * gap, y2(sign * base), bw)}" fill="${color}"/>`;
    }).join('');
  };
  const flowBars = rows.map((r, i) => stack(i, [[r.pvToBat, 'var(--c-yellow)'], [r.gridToBat, 'var(--c-blue)']], 1)
    + stack(i, [[r.batToLoad, 'var(--c-aqua)'], [r.batToGrid, 'var(--c-violet)']], -1)).join('');
  const flows = svg(H2, yAxis(s2, y2, pad.l, pad.l + w) + hourAxis(hours, x, band, H2) + flowBars + hits(H2, h2));

  // Battery level by origin, % of capacity
  const H3 = 150;
  const h3 = H3 - pad.t - pad.b;
  const s3 = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
  const y3 = (v) => pad.t + ((s3.max - v) / (s3.max - s3.min)) * h3;
  const states = [before, ...rows];
  const pct = (e) => (100 * e) / cfg.capacity;
  const layers = [['solarE', 'var(--c-yellow)'], ['gridE', 'var(--c-blue)'], ['startE', 'var(--c-gray)']];
  let lower = states.map(() => 0);
  const areas = layers.map(([key, color]) => {
    const upper = states.map((s, i) => lower[i] + pct(s[key]));
    const top = upper.map((v, i) => `${i ? 'L' : 'M'}${(pad.l + i * band).toFixed(1)},${y3(v).toFixed(1)}`).join('');
    const bottom = lower.map((v, i) => `L${(pad.l + i * band).toFixed(1)},${y3(v).toFixed(1)}`).reverse().join('');
    lower = upper;
    return `<path d="${top}${bottom}Z" fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1.5"/>`;
  }).join('');
  const minLine = `<line class="limit" x1="${pad.l}" x2="${pad.l + w}" y1="${y3(pct(cfg.eMin)).toFixed(1)}" y2="${y3(pct(cfg.eMin)).toFixed(1)}"/>`;
  const maxLine = cfg.eMax < cfg.capacity - 1e-9 ? `<line class="limit" x1="${pad.l}" x2="${pad.l + w}" y1="${y3(pct(cfg.eMax)).toFixed(1)}" y2="${y3(pct(cfg.eMax)).toFixed(1)}"/>` : '';
  const level = svg(H3, yAxis(s3, y3, pad.l, pad.l + w, { zero: false }) + hourAxis(hours, x, band, H3) + areas + minLine + maxLine + hits(H3, h3));

  return { prices, flows, level };
}
