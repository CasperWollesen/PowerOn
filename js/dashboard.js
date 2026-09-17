// Dashboard shell: top bar with the view-mode toggle, tabs, banners and footer.
// The tab content itself lives in day-view.js, history-view.js and outlook-view.js.

import { VIEW_MODES } from './settings.js';
import { renderDayView } from './day-view.js';
import { renderHistoryView, historyDayCount } from './history-view.js';
import { renderOutlookView } from './outlook-view.js';
import { shouldShowBanner, installState, installInstructions } from './install.js';
import { load, save } from './storage.js';
import { esc } from './format.js';
import { formatHourRange, shortDate, weekdayName } from './time.js';
import { icons, segmented } from './ui.js';

const GRID_HINT_KEY = 'ui.gridHintDismissed';

/**
 * @param {HTMLElement} container
 * @param {object} model  see app.js → dashboardModel()
 */
export function renderDashboard(container, model) {
  const { settings, selectedTab, days } = model;

  let view;
  if (selectedTab === 'history') view = renderHistoryView(model);
  else if (selectedTab === 'outlook') view = renderOutlookView(model);
  else view = renderDayView(model, selectedTab);

  const activeDay = days[selectedTab];

  container.innerHTML = `
    <header class="topbar">
      <h1 class="brand">Power<span>On</span></h1>
      <span class="topbar-spacer"></span>
      ${segmented('view-mode', VIEW_MODES, settings.viewMode, { small: true, label: 'Detail level' })}
      <button type="button" class="icon-btn" data-action="settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <nav class="day-tabs" aria-label="Day">
      ${tab('history', 'History', historySub(model), selectedTab)}
      ${tab('today', 'Today', daySub(days.today), selectedTab)}
      ${tab('tomorrow', 'Tomorrow', daySub(days.tomorrow), selectedTab)}
      ${tab('outlook', 'Outlook', outlookSub(model), selectedTab)}
    </nav>
    ${installBanner()}
    ${gridHint(model)}
    ${view.html}
    <footer class="foot muted">
      ${activeDay?.stale ? '<span class="warn">Offline – showing last saved prices.</span><br>' : ''}
      <span>${esc(settings.priceArea)} · ${esc(priceModelNote(model))} · window ${formatHourRange(model.window.start, model.window.end)}</span>
    </footer>
  `;

  container.querySelector('[data-action="settings"]').addEventListener('click', model.onOpenSettings);
  container.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => model.onSelectTab(b.dataset.tab)));
  container.querySelectorAll('[data-view-mode]').forEach((b) => b.addEventListener('click', () => model.onSetViewMode(b.dataset.viewMode)));

  container.querySelector('[data-action="install"]')?.addEventListener('click', model.onInstall);
  container.querySelector('[data-action="install-help"]')?.addEventListener('click', (e) => {
    e.currentTarget.closest('.banner').querySelector('.banner-help').hidden = false;
    e.currentTarget.hidden = true;
  });
  container.querySelector('[data-action="dismiss-install"]')?.addEventListener('click', model.onDismissInstall);
  container.querySelector('[data-action="grid-hint"]')?.addEventListener('click', model.onOpenSettings);
  container.querySelector('[data-action="dismiss-grid-hint"]')?.addEventListener('click', () => {
    save(GRID_HINT_KEY, true);
    model.onRerender();
  });

  view.mount(container);
}

function tab(id, label, sub, selected) {
  return `<button type="button" data-tab="${id}" class="${id === selected ? 'active' : ''}" aria-pressed="${id === selected}">${label}<small>${esc(sub)}</small></button>`;
}

function daySub(state) {
  if (state.status === 'ok') return `${weekdayName(state.date).slice(0, 3)} ${shortDate(state.date)}`;
  if (state.status === 'notPublished') return '~13:00';
  if (state.status === 'loading') return '…';
  return '';
}

function historySub(model) {
  const n = historyDayCount(model.settings.priceArea, model.now.date);
  return n ? `${n} days` : '…';
}

function outlookSub(model) {
  if (model.forecast?.status === 'ok') return `${model.forecast.days.length} days`;
  return '…';
}

function priceModelNote(model) {
  const { settings } = model;
  if (settings.priceMode === 'spot') return 'spot price excl. VAT';
  const grid = model.gridCompanyName ? model.gridCompanyName : 'no grid company';
  return `incl. tariffs, tax & VAT (${grid})`;
}

function installBanner() {
  if (!shouldShowBanner()) return '';
  const s = installState();
  return `
    <section class="banner">
      <div class="banner-text">
        <strong>Use PowerOn as an app</strong>
        <p class="banner-help muted" ${s.canPrompt ? 'hidden' : ''}>${installInstructions(icons.share)}</p>
      </div>
      <div class="banner-actions">
        ${s.canPrompt ? '<button type="button" class="btn btn-primary btn-small" data-action="install">Install</button>' : ''}
        <button type="button" class="icon-btn" data-action="dismiss-install" aria-label="Dismiss">${icons.close}</button>
      </div>
    </section>`;
}

function gridHint(model) {
  const { settings } = model;
  if (settings.priceMode !== 'full' || settings.gridCompany || load(GRID_HINT_KEY, false)) return '';
  return `
    <section class="banner">
      <div class="banner-text">
        <strong>Get your exact price</strong>
        <p class="muted">Prices include national tariffs, tax and VAT. Choose your grid company to add its tariff too.</p>
      </div>
      <div class="banner-actions">
        <button type="button" class="btn btn-primary btn-small" data-action="grid-hint">Choose</button>
        <button type="button" class="icon-btn" data-action="dismiss-grid-hint" aria-label="Dismiss">${icons.close}</button>
      </div>
    </section>`;
}
