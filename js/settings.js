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

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  chartMax: 10,          // kr./kWh – fixed Y-axis maximum
  dayStart: '06:00',     // start of the hours the user cares about
  dayEnd: '22:00',       // end (exclusive) of the hours the user cares about
  priceArea: 'DK1',
  includeVat: true,      // show prices incl. 25 % VAT
  extraPerKwh: 0,        // tariffs & taxes per kWh excl. VAT, added to the spot price
});

export function loadSettings() {
  const stored = load(KEY, {});
  return sanitize({ ...DEFAULT_SETTINGS, ...stored });
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
  out.includeVat = out.includeVat !== false;
  const extra = Number(out.extraPerKwh);
  out.extraPerKwh = Number.isFinite(extra) && extra >= 0 ? extra : 0;
  return out;
}

function isTimeString(v) {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
}

/**
 * The day window as whole hours: start is rounded down, end rounded up.
 * "06:00"–"22:00" → { start: 6, end: 22 } meaning hours 6..21 inclusive.
 * "00:00"–"00:00" is treated as the whole day.
 */
export function dayWindow(settings) {
  const [sh, sm] = settings.dayStart.split(':').map(Number);
  const [eh, em] = settings.dayEnd.split(':').map(Number);
  let start = sh;
  let end = em > 0 ? eh + 1 : eh;
  if (end === 0) end = 24;
  if (end <= start) return { start: 0, end: 24 };
  void sm;
  return { start, end: Math.min(end, 24) };
}

/** Apply the theme to the document root. */
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
