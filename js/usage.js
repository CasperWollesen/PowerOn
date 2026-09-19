// Pure interval analysis. All timestamps are absolute instants; no storage or DOM.
import { BANDS, bandFor } from './bands.js';

function intervals(rows, field) {
  const parsed = rows.map((row) => {
    const start = Date.parse(row.start), end = Date.parse(row.end);
    if (![row.start, row.end].every((s) => typeof s === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(s)) ||
        !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
        !Number.isFinite(row[field]) || (field === 'kwh' && row.kwh < 0)) throw new Error('Invalid interval data.');
    return { ...row, start, end };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].start < parsed[i - 1].end) throw new Error('Overlapping interval data.');
  }
  return parsed;
}

// @req USE-02 USE-03
export function analyseUsage(readings, priceRows, edges, from, to) {
  const consumption = intervals(readings, 'kwh').filter((r) => r.end > from && r.start < to).map((r) => {
    const start = Math.max(from, r.start), end = Math.min(to, r.end);
    return { ...r, start, end, kwh: r.kwh * (end - start) / (r.end - r.start) };
  });
  const prices = intervals(priceRows, 'price');
  const bands = BANDS.map((b) => ({ ...b, kwh: 0, cost: 0, share: 0 }));
  let total = 0, priced = 0, cost = 0, coveredMs = 0, estimatedKwh = 0, estimatedMs = 0, split = false;
  let cursor = 0;
  for (const r of consumption) {
    total += r.kwh;
    coveredMs += r.end - r.start;
    if (r.estimated) { estimatedKwh += r.kwh; estimatedMs += r.end - r.start; }
    while (cursor < prices.length && prices[cursor].end <= r.start) cursor++;
    for (let i = cursor; i < prices.length && prices[i].start < r.end; i++) {
      const p = prices[i];
      const overlap = Math.max(0, Math.min(r.end, p.end) - Math.max(r.start, p.start));
      if (!overlap) continue;
      const energy = r.kwh * overlap / (r.end - r.start);
      const band = bands.find((b) => b.id === bandFor(p.price, edges));
      band.kwh += energy;
      band.cost += energy * p.price;
      priced += energy;
      cost += energy * p.price;
      if (overlap < r.end - r.start) split = true;
    }
  }
  for (const b of bands) b.share = total > 0 ? b.kwh / total * 100 : 0;
  const high = bands.filter((b) => ['expensive', 'extreme'].includes(b.id));
  const highKwh = high.reduce((s, b) => s + b.kwh, 0);
  const highShare = total > 0 ? highKwh / total * 100 : 0;
  let base = null;
  if (coveredMs >= 167 * 3600000 && coveredMs === to - from && estimatedMs === 0) {
    const powers = consumption.map((r) => ({ kw: r.kwh / ((r.end - r.start) / 3600000), ms: r.end - r.start }))
      .sort((a, b) => a.kw - b.kw);
    let accumulated = 0;
    const floor = powers.find((p) => { accumulated += p.ms; return accumulated >= coveredMs * 0.1; });
    const energy = consumption.reduce((s, r) => s + Math.min(r.kwh, floor.kw * (r.end - r.start) / 3600000), 0);
    base = { kw: floor.kw, kwh: energy };
  }
  return { total, priced, cost, bands, unpriced: Math.max(0, total - priced), coveredMs,
    coverage: coveredMs / (to - from) * 100, estimatedKwh, estimatedMs, split, base,
    highKwh, highShare, highCost: high.reduce((s, b) => s + b.cost, 0), significant: highShare >= 20 };
}
