// Settings view: general settings + appliance management.

import { PRICE_AREAS, THEMES } from './settings.js';
import { MODES, unitLabel } from './appliances.js';
import { esc, numShort, hours as fmtHours } from './format.js';

/**
 * @param {HTMLElement} container
 * @param {object} props
 * @param {object} props.settings
 * @param {Array} props.appliances
 * @param {function} props.onSettingsChange   (patch) => void
 * @param {function} props.onApplianceSave    (data, id|null) => void
 * @param {function} props.onApplianceRemove  (id) => void
 * @param {function} props.onBack             () => void
 */
export function renderSettings(container, props) {
  const { settings, appliances } = props;

  container.innerHTML = `
    <header class="topbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Back">${backIcon()}</button>
      <h1>Settings</h1>
      <span class="topbar-spacer"></span>
    </header>

    <section class="card">
      <h2>Appliances</h2>
      <p class="muted">Stored on this device only.</p>
      <ul class="appliance-list" id="appliance-list">
        ${appliances.length ? appliances.map(applianceRow).join('') : '<li class="muted empty">No appliances yet.</li>'}
      </ul>
      <button type="button" class="btn btn-primary btn-block" data-action="add">+ Add appliance</button>
    </section>

    <section class="card">
      <h2>Prices</h2>
      <label class="field">
        <span>Price area</span>
        <select name="priceArea">
          ${PRICE_AREAS.map((a) => `<option value="${a.id}" ${a.id === settings.priceArea ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Day starts</span>
          <input type="time" name="dayStart" value="${esc(settings.dayStart)}" step="3600">
        </label>
        <label class="field">
          <span>Day ends</span>
          <input type="time" name="dayEnd" value="${esc(settings.dayEnd)}" step="3600">
        </label>
      </div>
      <p class="muted">Recommendations only consider hours between these times.</p>
      <label class="field">
        <span>Maximum chart price (kr./kWh)</span>
        <input type="number" name="chartMax" value="${esc(settings.chartMax)}" min="0.5" step="0.5" inputmode="decimal">
      </label>
      <p class="muted">The chart always shows 0 to this value, so days are comparable. Higher prices are marked as over the maximum.</p>
    </section>

    <section class="card">
      <h2>Appearance</h2>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        ${THEMES.map(
          (t) =>
            `<button type="button" role="radio" aria-checked="${t.id === settings.theme}" data-theme="${t.id}" class="${t.id === settings.theme ? 'active' : ''}">${esc(t.label)}</button>`,
        ).join('')}
      </div>
    </section>

    <section class="card about">
      <h2>About</h2>
      <p class="muted">Prices: day-ahead spot prices (excl. taxes, tariffs and VAT) from elprisenligenu.dk. Weather: Open-Meteo.</p>
      <p class="muted">Version <span id="app-version">1.0.0</span></p>
    </section>

    <dialog id="appliance-dialog" class="dialog">
      <form method="dialog" id="appliance-form" class="dialog-form">
        <h2 id="appliance-dialog-title">Add appliance</h2>
        <input type="hidden" name="id" value="">
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" required maxlength="40" placeholder="Dehumidifier" autocomplete="off">
        </label>
        <label class="field">
          <span>Consumption type</span>
          <div class="segmented" data-mode-switch>
            ${MODES.map((m) => `<button type="button" data-mode="${m.id}">${esc(m.label)}</button>`).join('')}
          </div>
          <input type="hidden" name="mode" value="hour">
        </label>
        <label class="field">
          <span>Consumption (<span data-unit-label>kWh/h</span>)</span>
          <input type="number" name="kwh" required min="0.001" step="0.001" inputmode="decimal" placeholder="0,255">
        </label>
        <label class="field" data-duration-field hidden>
          <span>Cycle duration (hours)</span>
          <input type="number" name="durationHours" min="0.25" step="0.25" inputmode="decimal" placeholder="3,5">
          <small class="muted">Used to find the cheapest start time. Leave empty to treat the cycle as one hour.</small>
        </label>
        <p class="form-error" data-form-error hidden></p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </dialog>
  `;

  wireEvents(container, props);
}

function applianceRow(a) {
  const detail =
    a.mode === 'cycle'
      ? `${numShort(a.kwh)} ${unitLabel(a)}${a.durationHours ? ` · ${fmtHours(a.durationHours)}` : ''}`
      : `${numShort(a.kwh)} ${unitLabel(a)}`;
  return `
    <li class="appliance-row" data-id="${esc(a.id)}">
      <div class="appliance-info">
        <strong>${esc(a.name)}</strong>
        <span class="muted">${esc(detail)}</span>
      </div>
      <div class="appliance-actions">
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${esc(a.name)}">${editIcon()}</button>
        <button type="button" class="icon-btn danger" data-action="remove" aria-label="Remove ${esc(a.name)}">${trashIcon()}</button>
      </div>
    </li>`;
}

function wireEvents(container, props) {
  const { settings, appliances, onSettingsChange, onApplianceSave, onApplianceRemove, onBack } = props;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  // General settings
  container.querySelector('select[name="priceArea"]').addEventListener('change', (e) => onSettingsChange({ priceArea: e.target.value }));
  container.querySelector('input[name="dayStart"]').addEventListener('change', (e) => onSettingsChange({ dayStart: e.target.value || settings.dayStart }));
  container.querySelector('input[name="dayEnd"]').addEventListener('change', (e) => onSettingsChange({ dayEnd: e.target.value || settings.dayEnd }));
  container.querySelector('input[name="chartMax"]').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v > 0) onSettingsChange({ chartMax: v });
    else e.target.value = settings.chartMax;
  });
  container.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSettingsChange({ theme: btn.dataset.theme });
      container.querySelectorAll('[data-theme]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
      });
    });
  });

  // Appliance dialog
  const dialog = container.querySelector('#appliance-dialog');
  const form = container.querySelector('#appliance-form');
  const title = container.querySelector('#appliance-dialog-title');
  const modeInput = form.elements.mode;
  const durationField = form.querySelector('[data-duration-field]');
  const unitLabelEl = form.querySelector('[data-unit-label]');
  const errorEl = form.querySelector('[data-form-error]');

  function setMode(mode) {
    modeInput.value = mode;
    form.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    durationField.hidden = mode !== 'cycle';
    unitLabelEl.textContent = MODES.find((m) => m.id === mode).unit;
  }

  function openDialog(appliance = null) {
    form.reset();
    errorEl.hidden = true;
    title.textContent = appliance ? 'Edit appliance' : 'Add appliance';
    form.elements.id.value = appliance?.id ?? '';
    form.elements.name.value = appliance?.name ?? '';
    form.elements.kwh.value = appliance?.kwh ?? '';
    form.elements.durationHours.value = appliance?.durationHours ?? '';
    setMode(appliance?.mode ?? 'hour');
    dialog.showModal();
    form.elements.name.focus();
  }

  form.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // tap on backdrop
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: form.elements.name.value.trim(),
      kwh: Number(String(form.elements.kwh.value).replace(',', '.')),
      mode: modeInput.value,
      durationHours: Number(String(form.elements.durationHours.value).replace(',', '.')) || null,
    };
    if (!data.name || !Number.isFinite(data.kwh) || data.kwh <= 0) {
      errorEl.textContent = 'Please enter a name and a consumption above 0.';
      errorEl.hidden = false;
      return;
    }
    dialog.close();
    onApplianceSave(data, form.elements.id.value || null);
  });

  container.querySelector('[data-action="add"]').addEventListener('click', () => openDialog());

  container.querySelector('#appliance-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const appliance = appliances.find((a) => a.id === id);
    if (!appliance) return;
    if (btn.dataset.action === 'edit') openDialog(appliance);
    if (btn.dataset.action === 'remove' && confirm(`Remove "${appliance.name}"?`)) onApplianceRemove(id);
  });
}

function backIcon() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
}
function editIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
}
function trashIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
}
