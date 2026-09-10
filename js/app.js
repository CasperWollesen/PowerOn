// App bootstrap: state, routing between views, data loading and refresh timers.

import { getDayPrices, NotPublishedError, pruneOldPrices } from './api.js';
import { loadSettings, saveSettings, applyTheme, watchSystemTheme, dayWindow } from './settings.js';
import { loadAppliances, saveAppliances, addAppliance, updateAppliance, removeAppliance, addDefaults } from './appliances.js';
import { requestPersistentStorage } from './storage.js';
import { nowInDenmark, addDays } from './time.js';
import { renderDashboard } from './dashboard.js';
import { renderSettings } from './settings-view.js';

const root = document.getElementById('app');

const state = {
  settings: loadSettings(),
  appliances: loadAppliances(),
  view: 'dashboard',
  selectedDay: 'today',
  autoSelectedDay: false,
  now: nowInDenmark(),
  days: {
    today: { status: 'loading', date: null },
    tomorrow: { status: 'loading', date: null },
  },
};

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (state.view === 'settings') {
    renderSettings(root, {
      settings: state.settings,
      appliances: state.appliances,
      onSettingsChange: handleSettingsChange,
      onApplianceSave: handleApplianceSave,
      onApplianceRemove: handleApplianceRemove,
      onAddDefaults: handleAddDefaults,
      onBack: () => navigate('dashboard'),
    });
  } else {
    renderDashboard(root, {
      settings: state.settings,
      window: dayWindow(state.settings),
      selectedDay: state.selectedDay,
      now: state.now,
      days: state.days,
      appliances: state.appliances,
      onSelectDay: (day) => {
        state.selectedDay = day;
        render();
      },
      onOpenSettings: () => navigate('settings'),
      onRefresh: () => loadPrices({ force: true }),
    });
  }
  window.scrollTo(0, 0);
}

function navigate(view) {
  const hash = view === 'settings' ? '#settings' : '';
  if (location.hash !== hash) {
    location.hash = hash; // triggers hashchange → applyRoute
  } else {
    applyRoute();
  }
}

function applyRoute() {
  state.view = location.hash === '#settings' ? 'settings' : 'dashboard';
  render();
}

// ---------------------------------------------------------------------------
// Settings & appliances

function handleSettingsChange(patch) {
  const before = state.settings;
  state.settings = saveSettings({ ...before, ...patch });
  if (patch.theme !== undefined) applyTheme(state.settings.theme);
  if (patch.priceArea && patch.priceArea !== before.priceArea) loadPrices({ force: true });
  // The settings view keeps its own DOM; the dashboard re-renders on navigation.
}

function handleApplianceSave(data, id) {
  state.appliances = id ? updateAppliance(state.appliances, id, data) : addAppliance(state.appliances, data);
  saveAppliances(state.appliances);
  render();
}

function handleAddDefaults(names) {
  state.appliances = addDefaults(state.appliances, names);
  saveAppliances(state.appliances);
  render();
}

function handleApplianceRemove(id) {
  state.appliances = removeAppliance(state.appliances, id);
  saveAppliances(state.appliances);
  render();
}

// ---------------------------------------------------------------------------
// Prices

let loading = false;

async function loadPrices({ force = false } = {}) {
  if (loading) return;
  loading = true;
  state.now = nowInDenmark();
  const todayDate = state.now.date;
  const tomorrowDate = addDays(todayDate, 1);
  const area = state.settings.priceArea;

  state.days.today = { status: 'loading', date: todayDate };
  state.days.tomorrow = { status: 'loading', date: tomorrowDate };
  if (state.view === 'dashboard') render();

  const [today, tomorrow] = await Promise.all([
    loadDay(area, todayDate, force),
    loadDay(area, tomorrowDate, force),
  ]);
  state.days.today = today;
  state.days.tomorrow = tomorrow;
  loading = false;

  // If today's window is already over, jump to tomorrow once (user can still switch back).
  if (!state.autoSelectedDay) {
    state.autoSelectedDay = true;
    const win = dayWindow(state.settings);
    if (state.now.hour >= win.end && tomorrow.status === 'ok') state.selectedDay = 'tomorrow';
  }

  pruneOldPrices(todayDate);
  if (state.view === 'dashboard') render();
}

async function loadDay(area, date, force) {
  try {
    const day = await getDayPrices(area, date, { preferCache: !force });
    return { status: 'ok', ...day };
  } catch (err) {
    if (err instanceof NotPublishedError) return { status: 'notPublished', date };
    console.error(`Failed to load prices for ${date}`, err);
    return { status: 'error', date, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Timers: keep "now" fresh, roll over at midnight, retry tomorrow's prices.

function tick() {
  const now = nowInDenmark();
  const hourChanged = now.hour !== state.now.hour;
  const dateChanged = now.date !== state.now.date;
  state.now = now;

  if (dateChanged) {
    state.autoSelectedDay = false;
    state.selectedDay = 'today';
    loadPrices();
    return;
  }

  // Tomorrow's prices are published around 13:00 – retry every 15 minutes after 12:00.
  const shouldRetryTomorrow = state.days.tomorrow.status !== 'ok' && now.hour >= 12 && now.minute % 15 === 0;
  if (shouldRetryTomorrow) {
    loadPrices();
    return;
  }

  if (hourChanged && state.view === 'dashboard') render();
}

// ---------------------------------------------------------------------------
// PWA

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service worker registration failed', err));
  });
}

// ---------------------------------------------------------------------------
// Init

applyTheme(state.settings.theme);
watchSystemTheme(() => state.settings.theme);
requestPersistentStorage();
registerServiceWorker();

window.addEventListener('hashchange', applyRoute);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick();
    // Refresh when coming back after a while (e.g. app reopened next day).
    if (state.days.today.status !== 'ok' || state.days.tomorrow.status !== 'ok') loadPrices();
  }
});
setInterval(tick, 60 * 1000);

applyRoute();
loadPrices();
