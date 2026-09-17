// Settings view: general settings + appliance management.

import { PRICE_AREAS, THEMES, PRICE_MODES } from './settings.js';
import { MODES, unitLabel, missingDefaults } from './appliances.js';
import { cachedGridCompanies } from './tariffs.js';
import { installState, installInstructions } from './install.js';
import { esc, numShort, hours as fmtHours } from './format.js';
import { icons, segmented } from './ui.js';

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
// @req SET-01 SET-04 SET-06 SET-08 APPL-02
export function renderSettings(container, props) {
  const { settings, appliances } = props;

  container.innerHTML = `
    <header class="topbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icons.back}</button>
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
      ${examplesSection(appliances)}
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
      <div class="field">
        <span>Price shown</span>
        ${segmented('price-mode', PRICE_MODES, settings.priceMode, { label: 'Price shown' })}
      </div>
      <p class="muted">Full price = spot price + Energinet tariffs + electricity tax + your grid company's tariff + supplier surcharge, all incl. 25 % VAT.</p>
      <div data-full-only ${settings.priceMode === 'full' ? '' : 'hidden'}>
        <label class="field">
          <span>Grid company (netselskab)</span>
          <select name="gridCompany">${gridOptions(settings)}</select>
        </label>
        <p class="muted">Shown on your electricity bill. Its tariff is highest 17–21 and changes with the season.</p>
        <label class="field">
          <span>Supplier surcharge per kWh, excl. VAT (kr.)</span>
          <input type="number" name="supplierSurcharge" value="${esc(settings.supplierSurcharge)}" min="0" step="0.01" inputmode="decimal" placeholder="0">
        </label>
        <p class="muted">Your electricity supplier's markup on the spot price (spottillæg). Often 0–0,10 kr.</p>
      </div>
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

    <section class="card">
      <h2>Install as app</h2>
      <p class="muted">${installInstructions(icons.share)}</p>
      ${installState().canPrompt ? '<button type="button" class="btn btn-primary btn-block" data-action="install">Install app</button>' : ''}
    </section>

    <section class="card about">
      <h2>About</h2>
      <p class="muted">Spot prices: Nord Pool day-ahead prices via elprisenligenu.dk (hourly average of the 15-minute prices). Tariffs and taxes: stromligning.dk. Weather: Open-Meteo. The outlook for coming days is an estimate from the weather forecast.</p>
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

// @req APPL-04
function examplesSection(appliances) {
  const missing = missingDefaults(appliances);
  if (!missing.length) return '';
  return `
    <div class="examples">
      <p class="muted">Examples – add one or all to see what the app can do:</p>
      <ul class="example-list">
        ${missing
          .map(
            (d) => `
          <li>
            <span class="example-info"><strong>${esc(d.name)}</strong><span class="muted">${esc(applianceDetail(d))}</span></span>
            <button type="button" class="btn btn-small" data-action="add-default" data-name="${esc(d.name)}">Add</button>
          </li>`,
          )
          .join('')}
      </ul>
      ${missing.length > 1 ? `<button type="button" class="btn btn-block" data-action="add-all-defaults">Add all ${missing.length} examples</button>` : ''}
    </div>`;
}

function applianceDetail(a) {
  return a.mode === 'cycle'
    ? `${numShort(a.kwh)} ${unitLabel(a)}${a.durationHours ? ` · ${fmtHours(a.durationHours)}` : ''}`
    : `${numShort(a.kwh)} ${unitLabel(a)}`;
}

function applianceRow(a) {
  const detail = applianceDetail(a);
  return `
    <li class="appliance-row" data-id="${esc(a.id)}">
      <div class="appliance-info">
        <strong>${esc(a.name)}</strong>
        <span class="muted">${esc(detail)}</span>
      </div>
      <div class="appliance-actions">
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${esc(a.name)}">${icons.edit}</button>
        <button type="button" class="icon-btn danger" data-action="remove" aria-label="Remove ${esc(a.name)}">${icons.trash}</button>
      </div>
    </li>`;
}

function wireEvents(container, props) {
  const { settings, appliances, onSettingsChange, onApplianceSave, onApplianceRemove, onAddDefaults, onBack, loadGridCompanies, onInstall } = props;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  // Example appliances
  container.querySelectorAll('[data-action="add-default"]').forEach((btn) => btn.addEventListener('click', () => onAddDefaults([btn.dataset.name])));
  container.querySelector('[data-action="add-all-defaults"]')?.addEventListener('click', () => onAddDefaults(missingDefaults(appliances).map((d) => d.name)));

  // Price model
  const areaSelect = container.querySelector('select[name="priceArea"]');
  const gridSelect = container.querySelector('select[name="gridCompany"]');
  container.querySelectorAll('[data-price-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.priceMode;
      onSettingsChange({ priceMode: mode });
      setActive(container, '[data-price-mode]', btn);
      container.querySelector('[data-full-only]').hidden = mode !== 'full';
    });
  });
  gridSelect.addEventListener('change', (e) => onSettingsChange({ gridCompany: e.target.value }));
  container.querySelector('input[name="supplierSurcharge"]').addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (Number.isFinite(v) && v >= 0) onSettingsChange({ supplierSurcharge: v });
    else e.target.value = settings.supplierSurcharge;
  });
  if (loadGridCompanies) {
    loadGridCompanies()
      .then(() => {
        gridSelect.innerHTML = gridOptions({ priceArea: areaSelect.value, gridCompany: gridSelect.value });
      })
      .catch(() => {});
  }
  container.querySelector('[data-action="install"]')?.addEventListener('click', onInstall);

  // General settings
  container.querySelector('select[name="priceArea"]').addEventListener('change', (e) => {
    onSettingsChange({ priceArea: e.target.value, gridCompany: '' });
    container.querySelector('select[name="gridCompany"]').innerHTML = gridOptions({ priceArea: e.target.value, gridCompany: '' });
  });
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
      setActive(container, '[data-theme]', btn);
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

function setActive(container, selector, activeBtn) {
  container.querySelectorAll(selector).forEach((b) => {
    const active = b === activeBtn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', String(active));
  });
}

// @req PRICE-05
function gridOptions(settings) {
  const companies = cachedGridCompanies().filter((c) => c.priceArea === settings.priceArea);
  const selected = settings.gridCompany;
  const options = [`<option value="" ${selected ? '' : 'selected'}>Not selected – national tariffs only</option>`];
  if (selected && !companies.some((c) => c.id === selected)) {
    options.push(`<option value="${esc(selected)}" selected>${esc(selected)}</option>`);
  }
  for (const c of companies) {
    options.push(`<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`);
  }
  if (!companies.length) options.push('<option disabled>Loading grid companies…</option>');
  return options.join('');
}
