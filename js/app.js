// App bootstrap: state, routing between views, data loading and refresh timers.

import { getDayPrices, NotPublishedError, pruneOldPrices, backfillPrices, cachedDay } from './api.js';
import { fetchDayTariffs, getGridCompanies, cachedGridCompanies, pruneOldTariffs } from './tariffs.js';
import { getWeather, cachedWeather } from './weather.js';
import { buildForecast } from './forecast.js';
import { loadSettings, saveSettings, applyTheme, watchSystemTheme, dayWindow } from './settings.js';
import { loadAppliances, saveAppliances, addAppliance, updateAppliance, removeAppliance, addDefaults } from './appliances.js';
import { requestPersistentStorage } from './storage.js';
import { nowInDenmark, addDays } from './time.js';
import { renderDashboard } from './dashboard.js';
import { renderSettings } from './settings-view.js';
import { initInstall, promptInstall, dismissBanner } from './install.js';

const root = document.getElementById('app');
const HISTORY_BACKFILL_DAYS = 100;

const state = {
  settings: loadSettings(),
  appliances: loadAppliances(),
  view: 'dashboard',
  selectedTab: 'today',
  autoSelectedTab: false,
  now: nowInDenmark(),
  days: {
    today: { status: 'loading', date: null },
    tomorrow: { status: 'loading', date: null },
  },
  insights: { status: 'idle', progress: null, message: null },
  forecast: null,
};

// ---------------------------------------------------------------------------
// Rendering

function gridCompanyName() {
  const id = state.settings.gridCompany;
  if (!id) return '';
  return cachedGridCompanies().find((c) => c.id === id)?.name ?? id;
}

// @req NFR-08
function render({ scrollTop = false } = {}) {
  if (state.view === 'settings') {
    renderSettings(root, {
      settings: state.settings,
      appliances: state.appliances,
      onSettingsChange: handleSettingsChange,
      onApplianceSave: handleApplianceSave,
      onApplianceRemove: handleApplianceRemove,
      onAddDefaults: handleAddDefaults,
      loadGridCompanies: () => getGridCompanies(),
      onInstall: handleInstall,
      onBack: () => navigate('dashboard'),
    });
  } else {
    renderDashboard(root, {
      settings: state.settings,
      window: dayWindow(state.settings),
      selectedTab: state.selectedTab,
      now: state.now,
      days: state.days,
      appliances: state.appliances,
      forecast: state.forecast,
      insights: state.insights,
      gridCompanyName: gridCompanyName(),
      onSelectTab: (tab) => {
        state.selectedTab = tab;
        render({ scrollTop: true });
      },
      onSetViewMode: (mode) => {
        state.settings = saveSettings({ ...state.settings, viewMode: mode });
        render();
      },
      onOpenSettings: () => navigate('settings'),
      onRefresh: () => loadPrices({ force: true }),
      onRetryInsights: () => loadInsights({ force: true }),
      onInstall: handleInstall,
      onDismissInstall: () => {
        dismissBanner();
        render();
      },
      onRerender: () => render(),
    });
  }
  if (scrollTop) window.scrollTo(0, 0);
}

function renderIfDashboard() {
  if (state.view === 'dashboard') render();
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
  render({ scrollTop: true });
}

async function handleInstall() {
  await promptInstall();
  render();
}

// ---------------------------------------------------------------------------
// Settings & appliances

// @req SET-05 SET-07
function handleSettingsChange(patch) {
  const before = state.settings;
  state.settings = saveSettings({ ...before, ...patch });
  if (patch.theme !== undefined) applyTheme(state.settings.theme);

  const areaChanged = patch.priceArea !== undefined && patch.priceArea !== before.priceArea;
  const gridChanged = patch.gridCompany !== undefined && patch.gridCompany !== before.gridCompany;
  const windowChanged = (patch.dayStart && patch.dayStart !== before.dayStart) || (patch.dayEnd && patch.dayEnd !== before.dayEnd);

  if (areaChanged) {
    state.forecast = null;
    loadPrices({ force: true }).then(() => loadInsights({ force: true }));
  } else if (gridChanged) {
    loadTariffs();
  } else if (windowChanged) {
    computeForecast();
  }
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
// Prices & tariffs

let loadingPrices = null;

// @req DATA-01 DAY-01
function loadPrices({ force = false } = {}) {
  if (loadingPrices) return loadingPrices;
  loadingPrices = (async () => {
    state.now = nowInDenmark();
    const todayDate = state.now.date;
    const tomorrowDate = addDays(todayDate, 1);
    const area = state.settings.priceArea;

    if (state.days.today.date !== todayDate || force) {
      state.days.today = { status: 'loading', date: todayDate };
      state.days.tomorrow = { status: 'loading', date: tomorrowDate };
      renderIfDashboard();
    }

    const [today, tomorrow] = await Promise.all([loadDay(area, todayDate, force), loadDay(area, tomorrowDate, force)]);
    state.days.today = today;
    state.days.tomorrow = tomorrow;

    // If today's window is already over, jump to tomorrow once (user can still switch back).
    if (!state.autoSelectedTab) {
      state.autoSelectedTab = true;
      if (state.now.hour >= dayWindow(state.settings).end && tomorrow.status === 'ok' && state.selectedTab === 'today') {
        state.selectedTab = 'tomorrow';
      }
    }

    pruneOldPrices(todayDate);
    pruneOldTariffs(todayDate);
    renderIfDashboard();
    await loadTariffs();
    computeForecast();
  })().finally(() => {
    loadingPrices = null;
  });
  return loadingPrices;
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

/** Tariffs for today and tomorrow. Failures fall back to cached/national tariffs. */
// @req PRICE-03
async function loadTariffs() {
  const { priceArea, gridCompany, priceMode } = state.settings;
  if (priceMode !== 'full') return;
  const dates = [state.days.today, state.days.tomorrow].filter((d) => d.status === 'ok').map((d) => d.date);
  const results = await Promise.allSettled(dates.map((date) => fetchDayTariffs(priceArea, gridCompany, date)));
  results.forEach((r) => r.status === 'rejected' && console.warn('Tariffs unavailable', r.reason));
  // Grid company names for the footer.
  if (gridCompany && !cachedGridCompanies().length) await getGridCompanies().catch(() => {});
  renderIfDashboard();
}

// ---------------------------------------------------------------------------
// Insights: price history backfill, weather and outlook

let insightsRunning = false;

// @req DATA-06 DATA-08
async function loadInsights({ force = false } = {}) {
  if (insightsRunning) return;
  insightsRunning = true;
  state.insights = { status: 'loading', progress: null, message: null };
  const showsProgress = () => state.view === 'dashboard' && ['history', 'outlook'].includes(state.selectedTab);
  try {
    const area = state.settings.priceArea;
    const today = state.now.date;
    const weatherPromise = getWeather({ force });
    let lastRender = 0;
    await backfillPrices(area, addDays(today, -HISTORY_BACKFILL_DAYS), addDays(today, -1), {
      onProgress: (done, total) => {
        state.insights.progress = { done, total };
        if (showsProgress() && Date.now() - lastRender > 700) {
          lastRender = Date.now();
          render();
        }
      },
    });
    await weatherPromise;
    state.insights = { status: 'ready', progress: null, message: null };
    computeForecast();
  } catch (err) {
    console.error('Insights failed', err);
    state.insights = { status: 'error', progress: null, message: err.message };
    computeForecast(); // may still work from cache
  } finally {
    insightsRunning = false;
    renderIfDashboard();
  }
}

function computeForecast() {
  const weather = cachedWeather();
  if (!weather?.days) return;
  const { today, tomorrow } = state.days;
  const latestKnownDate = tomorrow.status === 'ok' ? tomorrow.date : today.status === 'ok' ? today.date : null;
  if (!latestKnownDate) return;
  const area = state.settings.priceArea;
  try {
    state.forecast = buildForecast({
      spotHours: (date) => cachedDay(area, date)?.hours ?? null,
      weather: weather.days,
      window: dayWindow(state.settings),
      todayDate: state.now.date,
      latestKnownDate,
    });
  } catch (err) {
    console.error('Forecast failed', err);
    state.forecast = null;
  }
  renderIfDashboard();
}

// ---------------------------------------------------------------------------
// Timers: keep "now" fresh, roll over at midnight, retry tomorrow's prices.

// @req DATA-03 DATA-10
function tick() {
  const now = nowInDenmark();
  const hourChanged = now.hour !== state.now.hour;
  const dateChanged = now.date !== state.now.date;
  state.now = now;

  if (dateChanged) {
    state.autoSelectedTab = false;
    if (state.selectedTab === 'tomorrow') state.selectedTab = 'today';
    loadPrices().then(() => loadInsights());
    return;
  }

  // Tomorrow's prices are published around 13:00 – retry every 15 minutes after 12:00.
  if (state.days.tomorrow.status !== 'ok' && now.hour >= 12 && now.minute % 15 === 0) {
    loadPrices();
    return;
  }

  if (hourChanged) renderIfDashboard();
}

// ---------------------------------------------------------------------------
// PWA

// @req PWA-02
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
initInstall(renderIfDashboard);

window.addEventListener('hashchange', applyRoute);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick();
  if (state.days.today.status !== 'ok' || state.days.tomorrow.status !== 'ok') loadPrices();
  const weather = cachedWeather();
  if (!weather || Date.now() - weather.fetchedAt > 3 * 3600 * 1000) loadInsights();
});
setInterval(tick, 60 * 1000);

applyRoute();
computeForecast(); // instant outlook from cache while fresh data loads
loadPrices().then(() => loadInsights());
