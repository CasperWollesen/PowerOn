// Settings: defaults, validation and migration from older versions.
// These tests touch localStorage, so they save and restore whatever is there.

import { test, expect } from './harness.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../js/settings.js';

const KEY = 'poweron.settings';

function withStoredSettings(raw, fn) {
  const before = localStorage.getItem(KEY);
  try {
    if (raw === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(raw));
    return fn();
  } finally {
    if (before === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, before);
  }
}

test('SET-03', 'a fresh install gets the documented defaults', () => {
  const s = withStoredSettings(null, loadSettings);
  expect(s.theme).toBe('system');
  expect(s.chartMax).toBe(10);
  expect(s.dayStart).toBe('06:00');
  expect(s.dayEnd).toBe('22:00');
  expect(s.priceArea).toBe('DK1');
  expect(s.priceMode).toBe('full');
  expect(s.gridCompany).toBe('');
  expect(s.supplierSurcharge).toBe(0);
  expect(s.viewMode).toBe('full');
});

test('SET-02', 'nonsense values fall back to the defaults', () => {
  const s = withStoredSettings(
    { theme: 'neon', chartMax: -5, dayStart: 'morning', dayEnd: '25:00', priceArea: 'DK9', priceMode: 'guess', viewMode: 'x', supplierSurcharge: -1, gridCompany: 42 },
    loadSettings,
  );
  expect(s.theme).toBe(DEFAULT_SETTINGS.theme);
  expect(s.chartMax).toBe(DEFAULT_SETTINGS.chartMax);
  expect(s.dayStart).toBe(DEFAULT_SETTINGS.dayStart);
  expect(s.priceArea).toBe('DK1');
  expect(s.priceMode).toBe('full');
  expect(s.viewMode).toBe('full');
  expect(s.supplierSurcharge).toBe(0);
  expect(s.gridCompany).toBe('');
  expect(s.dayEnd).toBe(DEFAULT_SETTINGS.dayEnd); // '25:00' looks like a time but is out of range
});

test('SET-02', 'settings from older versions are migrated', () => {
  const s = withStoredSettings({ extraPerKwh: 0.12, includeVat: false, chartMax: 6 }, loadSettings);
  expect(s.supplierSurcharge).toBe(0.12);
  expect(s.extraPerKwh).toBe(undefined);
  expect(s.includeVat).toBe(undefined);
  expect(s.chartMax).toBe(6); // valid settings survive
});

test('SET-02', 'saving keeps only clean values', () => {
  withStoredSettings(null, () => {
    const saved = saveSettings({ ...DEFAULT_SETTINGS, chartMax: '4.5', gridCompany: 'n1_c', viewMode: 'nerd' });
    expect(saved.chartMax).toBe(4.5);
    expect(saved.gridCompany).toBe('n1_c');
    expect(saved.viewMode).toBe('nerd');
    expect(JSON.parse(localStorage.getItem(KEY)).chartMax).toBe(4.5);
  });
});
