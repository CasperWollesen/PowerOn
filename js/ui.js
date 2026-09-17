// Shared UI snippets used by several views. Everything returns HTML strings.

import { esc, num } from './format.js';

export const LEVEL_LABEL = {
  'very-cheap': 'Very cheap',
  cheap: 'Cheap',
  normal: 'Normal',
  expensive: 'Expensive',
};

/** CSS level class; 'very-cheap' shares the cheap colours with a stronger badge. */
export function levelClass(level) {
  return `level-${level}`;
}

export function badge(level, text = LEVEL_LABEL[level]) {
  return `<span class="badge ${levelClass(level)}">${esc(text)}</span>`;
}

/** "1,8×" – a ratio rendered compactly, or '' when not meaningful. */
export function factorText(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return `${num(value, value >= 10 ? 0 : 1)}×`;
}

/**
 * Two small pills: how a price compares with the cheapest and the most
 * expensive hour of the reference set.
 */
export function factorPills({ vsCheapest, vsPriciest }, { compact = false } = {}) {
  const pills = [];
  if (vsCheapest != null) {
    const same = vsCheapest < 1.02;
    pills.push(
      `<span class="pill ${same ? 'pill-good' : ''}" title="Compared with the cheapest hour">${same ? 'Cheapest' : `${factorText(vsCheapest)} cheapest`}</span>`,
    );
  }
  if (vsPriciest != null) {
    const same = vsPriciest > 0.98;
    pills.push(
      `<span class="pill ${same ? 'pill-bad' : ''}" title="Compared with the most expensive hour">${same ? 'Priciest' : `${factorText(vsPriciest)} priciest`}</span>`,
    );
  }
  if (!pills.length) return '';
  return `<span class="pills ${compact ? 'compact' : ''}">${pills.join('')}</span>`;
}

/**
 * Lowest–highest price of a day, e.g. "0,07 – 2,10". Lowest is green, highest red.
 * @req DAY-08 HIST-02 OUT-06
 */
export function priceRange(low, high, { approx = false } = {}) {
  return `<span class="range">${approx ? '<span class="sep">~</span>' : ''}<span class="lo">${num(low)}</span><span class="sep">–</span><span class="hi">${num(high)}</span></span>`;
}

/**
 * Three tiles: lowest and highest hour of the day (prominent) and the average.
 * @param {{ low: {price, hour}, high: {price, hour}, avg: number }} r
 * @req DAY-08
 */
export function rangeTiles(r) {
  const spread = r.low.price >= 0.05 ? r.high.price / r.low.price : null;
  return `
    <div class="range-tiles">
      <div class="rt rt-low"><span class="rt-label">Lowest</span><span class="rt-value">${num(r.low.price)}</span><span class="rt-time">${String(r.low.hour).padStart(2, '0')}:00</span></div>
      <div class="rt rt-high"><span class="rt-label">Highest</span><span class="rt-value">${num(r.high.price)}</span><span class="rt-time">${String(r.high.hour).padStart(2, '0')}:00${spread && spread >= 1.05 ? ` · ${factorText(spread)}` : ''}</span></div>
      <div class="rt rt-avg"><span class="rt-label">Average</span><span class="rt-value">${num(r.avg)}</span><span class="rt-time">kr./kWh</span></div>
    </div>`;
}

export function segmented(name, options, active, { small = false, label = '' } = {}) {
  return `
    <div class="segmented ${small ? 'small' : ''}" role="radiogroup" ${label ? `aria-label="${esc(label)}"` : ''}>
      ${options
        .map(
          (o) =>
            `<button type="button" role="radio" data-${name}="${o.id}" aria-checked="${o.id === active}" class="${o.id === active ? 'active' : ''}">${esc(o.label)}</button>`,
        )
        .join('')}
    </div>`;
}

export function stateCard({ icon = '', title, text = '', action = '', spinner = false }) {
  return `
    <section class="card state">
      ${spinner ? '<div class="spinner"></div>' : ''}
      ${icon ? `<p class="big">${icon}</p>` : ''}
      <p><strong>${esc(title)}</strong></p>
      ${text ? `<p class="muted">${text}</p>` : ''}
      ${action}
    </section>`;
}

export const icons = {
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};
