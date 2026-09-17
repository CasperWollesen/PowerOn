// Hourly price chart rendered with plain HTML/CSS (no library).
// The Y axis is FIXED from 0 to `max` so days are visually comparable.
// Bars above `max` are clipped at the top and marked as over-max.

import { esc, num } from './format.js';
import { formatHour } from './time.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Array} opts.hours   classified hours: { hour, price, level, inWindow }
 * @param {number} opts.max    Y-axis maximum (kr./kWh)
 * @param {number|null} opts.nowHour  current hour if the chart shows today, else null
 * @param {function} [opts.onSelect]  called with the hour object when a bar is tapped
 */
export function renderChart(container, { hours, max, nowHour = null, onSelect, showAddOn = false }) {
  const ticks = gridTicks(max);
  const byHour = new Map(hours.map((h) => [h.hour, h]));

  const gridHtml = ticks
    .map(
      (t) =>
        `<div class="chart-gridline" style="--y:${(t / max) * 100}%"><span>${esc(num(t, t % 1 ? 2 : 0))}</span></div>`,
    )
    .join('');

  const barsHtml = Array.from({ length: 24 }, (_, hour) => {
    const h = byHour.get(hour);
    if (!h) return `<div class="bar bar-missing" data-hour="${hour}"></div>`;
    const clipped = Math.max(0, Math.min(h.price, max));
    const pct = (clipped / max) * 100;
    const classes = [
      'bar',
      `level-${h.level}`,
      h.inWindow ? '' : 'outside',
      nowHour !== null && hour < nowHour ? 'past' : '',
      nowHour !== null && hour === nowHour ? 'now' : '',
      h.price > max ? 'over-max' : '',
      h.price < 0 ? 'negative' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = `${formatHour(hour)} · ${num(h.price)} kr./kWh`;
    // Share of the bar that is tariffs, tax and VAT (the rest is spot incl. its VAT).
    let addOn = '';
    if (showAddOn && h.spot !== undefined && h.price > 0) {
      const spotPart = Math.max(0, h.spot) * 1.25;
      const share = Math.max(0, Math.min(1, 1 - spotPart / h.price));
      addOn = `<span class="bar-addon" style="--a:${share * 100}%"></span>`;
    }
    return `<button type="button" class="${classes}" data-hour="${hour}" aria-label="${esc(label)}" style="--h:${pct}%"><span class="bar-fill">${addOn}</span></button>`;
  }).join('');

  const axisHtml = [0, 6, 12, 18, 24]
    .map((h) => `<span style="--x:${(h / 24) * 100}%">${String(h).padStart(2, '0')}</span>`)
    .join('');

  container.innerHTML = `
    <div class="chart">
      <div class="chart-grid">${gridHtml}</div>
      <div class="chart-bars">${barsHtml}</div>
      <div class="chart-axis">${axisHtml}</div>
    </div>`;

  if (onSelect) {
    container.querySelector('.chart-bars').addEventListener('click', (e) => {
      const bar = e.target.closest('.bar');
      if (!bar) return;
      const h = byHour.get(Number(bar.dataset.hour));
      if (!h) return;
      container.querySelectorAll('.bar.selected').forEach((b) => b.classList.remove('selected'));
      bar.classList.add('selected');
      onSelect(h);
    });
  }
}

/** Evenly spaced "nice" gridline values from 0 to max (inclusive). */
function gridTicks(max) {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
  const target = max / 4;
  const step = candidates.find((c) => c >= target) ?? candidates[candidates.length - 1];
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(3)));
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}
