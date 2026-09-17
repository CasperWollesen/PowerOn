// User settings: defaults, persistence and theme handling.

import { load, save } from './storage.js';

const KEY = 'settings';

export const PRICE_AREAS = [
  { id: 'DK1', label: 'DK1 – West Denmark' },
  { id: 'DK2', label: 'DK2 – East Denmark' },
];

export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

// @req SET-03
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  chartMax: 10,          // kr./kWh – fixed Y-axis maximum
  dayStart: '06:00',     // start of the hours the user cares about
  dayEnd: '22:00',       // end (exclusive) of the hours the user cares about
  priceArea: 'DK1',
  priceMode: 'full',     // 'full' = spot + tariffs + taxes + VAT, 'spot' = raw spot price
  gridCompany: '',       // stromligning.dk supplier id of the grid company ('' = national tariffs only)
  supplierSurcharge: 0,  // electricity supplier's surcharge per kWh, excl. VAT
  viewMode: 'full',      // 'simple' | 'full' | 'nerd'
});

export const VIEW_MODES = [
  { id: 'simple', label: 'Simple' },
  { id: 'full', label: 'Full' },
  { id: 'nerd', label: 'Nerd' },
];

export const PRICE_MODES = [
  { id: 'full', label: 'Full price' },
  { id: 'spot', label: 'Spot only' },
];

// @req SET-02
export function loadSettings() {
  const stored = migrate(load(KEY, {}) ?? {});
  return sanitize({ ...DEFAULT_SETTINGS, ...stored });
}

/** Map settings from older versions onto the current shape. */
function migrate(stored) {
  const s = { ...stored };
  if (s.extraPerKwh !== undefined && s.supplierSurcharge === undefined) s.supplierSurcharge = s.extraPerKwh;
  delete s.extraPerKwh;
  delete s.includeVat;
  return s;
}

export function saveSettings(settings) {
  const clean = sanitize({ ...DEFAULT_SETTINGS, ...settings });
  save(KEY, clean);
  return clean;
}

function sanitize(s) {
  const out = { ...s };
  if (!THEMES.some((t) => t.id === out.theme)) out.theme = DEFAULT_SETTINGS.theme;
  if (!PRICE_AREAS.some((a) => a.id === out.priceArea)) out.priceArea = DEFAULT_SETTINGS.priceArea;
  const max = Number(out.chartMax);
  out.chartMax = Number.isFinite(max) && max > 0 ? max : DEFAULT_SETTINGS.chartMax;
  if (!isTimeString(out.dayStart)) out.dayStart = DEFAULT_SETTINGS.dayStart;
  if (!isTimeString(out.dayEnd)) out.dayEnd = DEFAULT_SETTINGS.dayEnd;
  if (!PRICE_MODES.some((m) => m.id === out.priceMode)) out.priceMode = DEFAULT_SETTINGS.priceMode;
  if (!VIEW_MODES.some((m) => m.id === out.viewMode)) out.viewMode = DEFAULT_SETTINGS.viewMode;
  out.gridCompany = typeof out.gridCompany === 'string' ? out.gridCompany : '';
  const surcharge = Number(out.supplierSurcharge);
  out.supplierSurcharge = Number.isFinite(surcharge) && surcharge >= 0 ? surcharge : 0;
  delete out.includeVat;
  delete out.extraPerKwh;
  return out;
}

function isTimeString(v) {
  if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [hours, minutes] = v.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * The day window as whole hours: start is rounded down, end rounded up.
 * "06:00"–"22:00" → { start: 6, end: 22 } meaning hours 6..21 inclusive.
 * "00:00"–"00:00" is treated as the whole day.
 */
// @req ANA-01
export function dayWindow(settings) {
  const [sh] = settings.dayStart.split(':').map(Number);
  const [eh, em] = settings.dayEnd.split(':').map(Number);
  const start = sh;
  let end = em > 0 ? eh + 1 : eh;
  if (end === 0) end = 24;
  if (end <= start) return { start: 0, end: 24 };
  return { start, end: Math.min(end, 24) };
}

/** Apply the theme to the document root. */
// @req SET-04
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
  updateThemeColorMeta();
}

function updateThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  // Read the resolved surface color from CSS so the browser chrome matches.
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (color) meta.setAttribute('content', color);
}

/** Re-apply when the OS theme changes and the user follows "System". */
export function watchSystemTheme(getTheme) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
}
