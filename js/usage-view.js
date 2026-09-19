import { esc, num, kwh, kr } from './format.js';
import { addDays, danishMidnight, shortDate, weekdayName } from './time.js';
import { bandEdges, bandFor, bandLabel } from './bands.js';
import { dayWindow } from './settings.js';
import { priceHours } from './tariffs.js';
import { analyseUsage, analyseDays, analyseHours } from './usage.js';

// Days the user has unfolded, kept here so background renders do not fold them.
const openDays = new Set();
const selectedHours = new Map(); // date → index of the selected column

// @req USE-04
export function renderUsageView(model) {
  const { usage: u, settings } = model;
  let content = '';
  if (u.status === 'loading') content = '<section class="card state" role="status"><h2>Loading consumption…</h2><p class="muted">Matching reported readings to published prices.</p></section>';
  else if (u.status === 'error') content = `<section class="card state" role="alert"><h2>Consumption unavailable</h2><p>${esc(u.message)}</p><button class="btn" data-usage-retry>Retry</button></section>`;
  else if (u.status === 'ready' && !u.intervals.length) content = '<section class="card state"><h2>No readings available</h2><p class="muted">Eloverblik may not have received recent readings yet. Try an earlier period.</p></section>';
  else if (u.status === 'ready') {
    try {
      let approximate = false;
      const prices = Object.entries(u.spots).flatMap(([date, spot]) => {
        const result = priceHours(settings, date, spot);
        if (settings.priceMode !== 'spot' && (result.tariffSource !== 'exact' || !settings.gridCompany)) approximate = true;
        return result.hours.filter((h) => h.start && h.end);
      });
      const report = analyseUsage(u.intervals, prices, bandEdges(settings), danishMidnight(u.loadedFrom), danishMidnight(addDays(u.loadedTo, 1)));
      const days = [];
      for (let date = u.loadedTo; date >= u.loadedFrom; date = addDays(date, -1)) {
        days.push({ date, from: danishMidnight(date), to: danishMidnight(addDays(date, 1)) });
      }
      const edges = bandEdges(settings);
      const hours = settings.dayStart && settings.dayEnd ? dayWindow(settings) : { start: 6, end: 22 };
      const rows = analyseDays(u.intervals, prices, edges, days).map((d, i) => ({ ...d,
        hours: analyseHours(u.intervals, prices, edges, days[i].from, days[i].to).filter((h) => h.hour >= hours.start && h.hour < hours.end) }));
      const chart = { edges, window: hours,
        kwhMax: Math.max(0.1, ...rows.flatMap((d) => d.hours.map((h) => h.kwh))),
        costMax: Math.max(0.1, ...rows.flatMap((d) => d.hours.map((h) => h.cost))) };
      content = summary(report, approximate, settings, rows, chart);
    } catch {
      content = '<section class="card state" role="alert"><h2>Data could not be matched safely</h2><p>Invalid or overlapping intervals were received. Reload the period to retry.</p></section>';
    }
  }
  return {
    html: `<section class="card">
      <h2>Usage History</h2><p class="muted">See how much electricity you use at each price level.</p>
      ${!u.connected && u.status !== 'loading' ? `<form data-usage-connect class="usage-form">
        <label>Worker URL<input name="url" type="url" placeholder="https://your-worker.your-subdomain.workers.dev" value="${esc(u.url)}" required autocomplete="url"></label>
        <label>Private app key<input name="key" type="password" required autocomplete="off" aria-describedby="usage-privacy"></label>
        <p id="usage-privacy" class="muted">Use your separate PowerOn app key, never your Eloverblik token. The key and readings stay in memory until you disconnect or reload.</p>
        <button class="btn btn-primary" type="submit">Connect privately</button>
        <a href="./docs/eloverblik-setup.md" target="_blank" rel="noopener">Cloudflare + Eloverblik setup guide</a>
      </form>` : `<div class="usage-actions"><span class="muted">${u.connected ? 'Private connection · session only' : 'Connecting privately…'}</span><button class="btn btn-small" data-usage-disconnect>Disconnect</button></div>`}
      <form data-usage-period class="usage-form">
        <div class="usage-actions">${[7, 30, 90].map((d) => `<button type="button" class="btn btn-small" data-usage-days="${d}">Last ${d} days</button>`).join('')}</div>
        <div class="usage-dates"><label>From<input name="from" type="date" value="${esc(u.from)}" max="${esc(addDays(model.now.date, -1))}" required></label>
          <label>Through<input name="to" type="date" value="${esc(u.to)}" max="${esc(addDays(model.now.date, -1))}" required></label></div>
        <button class="btn" type="submit" ${!u.connected || u.status === 'loading' ? 'disabled' : ''}>Load period</button>
      </form>
      <p class="muted">All hours in Danish time · up to 92 completed days. Recent readings may arrive late.</p>
      ${u.loadedFrom && u.status === 'ready' ? `<p class="muted">Showing ${esc(u.loadedFrom)} through ${esc(u.loadedTo)}.</p>` : ''}
    </section>${content}`,
    mount(container) {
      const connect = container.querySelector('[data-usage-connect]');
      // Set the password as a DOM property, never interpolate it into HTML.
      if (connect) {
        connect.elements.key.value = u.key;
        connect.addEventListener('input', () => model.onUsageDraft({ url: connect.elements.url.value, key: connect.elements.key.value }));
        connect.addEventListener('submit', (event) => { event.preventDefault(); model.onUsageConnect(); });
      }
      const period = container.querySelector('[data-usage-period]');
      period.addEventListener('input', () => model.onUsageDraft({ from: period.elements.from.value, to: period.elements.to.value }));
      period.addEventListener('submit', (event) => { event.preventDefault(); model.onUsageLoad(); });
      container.querySelectorAll('[data-usage-days]').forEach((b) => b.addEventListener('click', () => model.onUsagePreset(Number(b.dataset.usageDays))));
      container.querySelector('[data-usage-disconnect]')?.addEventListener('click', model.onUsageDisconnect);
      container.querySelector('[data-usage-retry]')?.addEventListener('click', model.onUsageLoad);
      container.querySelectorAll('[data-usage-day]').forEach((d) => d.addEventListener('toggle', () => {
        if (d.open) openDays.add(d.dataset.usageDay); else openDays.delete(d.dataset.usageDay);
      }));
      container.querySelectorAll('[data-usage-hours]').forEach((hours) => hours.addEventListener('click', (event) => {
        const column = event.target.closest('.usage-hour');
        if (!column) return;
        selectedHours.set(hours.dataset.usageHours, Number(column.dataset.index));
        hours.querySelectorAll('.usage-hour').forEach((c) => c.setAttribute('aria-pressed', String(c === column)));
        hours.parentElement.querySelector('[data-usage-readout]').textContent = column.dataset.detail;
      }));
    },
  };
}

// @req USE-02 USE-03 USE-04
function summary(r, approximate, settings, days, chart) {
  const noPrices = r.total > 0 && r.priced === 0;
  const partialPrices = r.unpriced > 0.000001;
  return `<section class="card usage-highlight ${r.bands.find((b) => b.id === 'extreme').kwh > 0 ? 'band-extreme' : 'band-expensive'}">
    <h2>${noPrices ? 'Price breakdown unavailable' : r.significant ? 'Significant consumption at high prices' : 'Consumption at high prices'}</h2>
    <p class="usage-number">${noPrices ? '–' : `${partialPrices ? '≥ ' : ''}${esc(num(r.highShare, 1))}%`} <span>of reported consumption</span></p>
    <p>${esc(kwh(r.highKwh))} during <strong>Expensive + Extreme</strong> periods · ${esc(kr(r.highCost))}</p>
    <p class="muted">${partialPrices ? 'Missing prices prevent a complete breakdown. The high-price amounts above include only matched readings.' : r.significant ? 'At least one fifth of your electricity was used in these bands. Look for loads you can move to cheaper periods.' : 'The breakdown below shows where your electricity went.'}</p>
  </section>
  <section class="card"><div class="usage-totals">
    <div><span class="muted">Reported consumption</span><strong>${esc(kwh(r.total))}</strong></div>
    <div><span class="muted">${partialPrices ? 'Partial cost · matched kWh' : settings.priceMode === 'spot' ? 'Spot cost · excl. VAT' : 'Estimated energy cost'}</span><strong>${noPrices ? 'Unavailable' : esc(kr(r.cost))}</strong></div>
  </div><p class="muted">${esc(num(r.coverage, 1))}% of period covered by readings.${r.coverage < 99.99 ? ' Partial data: totals are not the full period.' : ''}</p>
  ${r.estimatedMs > 0 ? `<p class="muted">Includes ${esc(kwh(r.estimatedKwh))} from estimated meter readings.</p>` : ''}
  ${r.unpriced > 0.000001 ? `<p><strong>${esc(kwh(r.unpriced))} unpriced</strong> — included in consumption, excluded from band costs.</p>` : ''}
  </section>
  <section class="card"><h2>Consumption by price band</h2><p class="muted">Share of all reported kWh, using your current price settings.</p>
    <div class="usage-bands">${r.bands.map((b) => `<div class="usage-band band-${esc(b.id)}">
      <div class="usage-band-head"><strong>${esc(b.icon)} ${esc(b.label)}</strong><strong>${esc(num(b.share, 1))}%</strong></div>
      <div class="usage-track" aria-hidden="true"><span style="width:${esc(b.share)}%"></span></div>
      <div class="usage-band-head"><span>${esc(kwh(b.kwh))}</span><span>${esc(kr(b.cost))}</span></div>
    </div>`).join('')}</div>
  </section>
  <section class="card"><h2>Estimated base consumption</h2>
    ${r.base ? `<p><strong>${esc(kwh(r.base.kwh))}</strong> over this period · ${esc(num(r.base.kw * 1000, 0))} W baseline.</p>
    <p class="muted">Based on the lowest 10% of measured power, weighted by duration and capped at each reading. This is a rough floor, not measured standby or guaranteed savings. Heating, appliances and solar can affect it.</p>` :
    '<p class="muted">Needs at least seven complete days of measured readings, without gaps or estimates. A base-load estimate is not meaningful for this selection.</p>'}
  </section>
  ${daily(days, chart)}
  <section class="card"><h2>About these numbers</h2><p class="muted">${settings.priceMode === 'spot' ? 'Spot costs exclude tariffs, taxes, supplier surcharge and VAT.' :
    'Full-price estimates use your current grid company and supplier surcharge, plus the existing hourly tariff model. Subscription fees are excluded.'}
    ${approximate ? 'Some historical tariffs are missing: nearest stored tariffs or national defaults are used, which can also change the assigned bands.' : ''}
    ${r.split ? 'Consumption spanning price intervals is split assuming uniform use within the reading.' : ''} These figures are not an electricity bill.</p>
    ${settings.viewMode === 'nerd' ? `<p class="muted">Covered: ${esc(num(r.coveredMs / 3600000, 2))} hours. Significant means at least 20% of reported kWh in Expensive or Extreme.</p>` : ''}
  </section>`;
}

// @req USE-05 USE-06
function daily(days, chart) {
  const range = `${String(chart.window.start).padStart(2, '0')}–${String(chart.window.end).padStart(2, '0')}`;
  return `<section class="card"><h2>Daily breakdown</h2>
    <p class="muted">Newest first · Danish days · only the price bands you actually used. Select a day to see its hours.</p>
    <div class="usage-days">${days.map((d) => `<details class="usage-day" data-usage-day="${esc(d.date)}" ${openDays.has(d.date) ? 'open' : ''}>
      <summary><div class="usage-band-head"><strong>${esc(weekdayName(d.date))} ${esc(shortDate(d.date))}</strong>
        <strong>${d.total > 0 ? `${esc(kwh(d.total))} · ${d.priced > 0 ? esc(kr(d.cost)) : 'no prices'}` : 'No readings'}</strong></div>
      ${d.bands.map((b) => `<div class="usage-day-band band-${esc(b.id)}"><span>${esc(b.icon)} ${esc(b.label)}</span><span>${esc(kwh(b.kwh))}</span><span>${esc(kr(b.cost))}</span></div>`).join('')}
      ${d.unpriced > 0.000001 ? `<div class="usage-day-band"><span>Unpriced</span><span>${esc(kwh(d.unpriced))}</span><span>–</span></div>` : ''}
      </summary>${hourChart(d, chart, range)}
    </details>`).join('')}</div>
  </section>`;
}

// @req USE-06
function hourChart(d, chart, range) {
  if (!d.hours.length) return '';
  const used = d.hours.reduce((s, h) => s + h.kwh, 0), priced = d.hours.reduce((s, h) => s + h.priced, 0);
  const cost = d.hours.reduce((s, h) => s + h.cost, 0);
  const paid = priced > 0.000001 ? cost / priced : null;
  const band = paid === null ? null : bandFor(paid, chart.edges);
  const selected = selectedHours.get(d.date);
  const details = d.hours.map((h) => {
    const hour = String(h.hour).padStart(2, '0');
    return `${hour}:00 · used ${kwh(h.kwh)} · ${h.price === null ? 'no price published' :
      `cost ${kr(h.cost)} · ${num(h.price)} kr./kWh · ${bandLabel(h.band)}`}`;
  });
  const columns = d.hours.map((h, i) => `<button type="button" class="usage-hour ${h.band ? `band-${esc(h.band)}` : ''}" data-index="${i}" data-detail="${esc(details[i])}" aria-label="${esc(details[i])}" aria-pressed="${i === selected}">
      <span class="usage-hour-value">${h.price === null ? '–' : esc(num(h.cost, 1))}</span>
      <span class="usage-hour-price"><span style="height:${esc(Math.max(0, Math.min(100, h.cost / chart.costMax * 100)))}%"></span></span>
      <span class="usage-hour-label">${esc(String(h.hour).padStart(2, '0'))}</span>
      <span class="usage-hour-kwh"><span style="height:${esc(Math.min(100, h.kwh / chart.kwhMax * 100))}%"></span></span>
      <span class="usage-hour-value">${esc(num(h.kwh, 1))}</span>
    </button>`).join('');
  return `<div class="usage-chart">
    <p class="${band ? `band-${esc(band)}` : ''}"><strong class="usage-paid">${paid === null ? 'No prices' : `${esc(bandLabel(band))} day · ${esc(num(paid))} kr./kWh paid on average`}</strong></p>
    <p class="muted">${esc(range)}: ${esc(kwh(used))}${priced > 0 ? ` · ${esc(kr(cost))}` : ''}</p>
    <p class="usage-chart-caption muted">▲ What each hour cost · kr. · same scale for every day (top = ${esc(kr(chart.costMax))})</p>
    <div class="usage-hours ${d.hours.length > 18 ? 'dense' : ''}" style="--n:${d.hours.length}" data-usage-hours="${esc(d.date)}">${columns}</div>
    <p class="usage-chart-caption muted">▼ What each hour used · kWh · same scale for every day (top = ${esc(kwh(chart.kwhMax))})</p>
    <p class="usage-readout" data-usage-readout role="status">${selected !== undefined && details[selected] ? esc(details[selected]) : 'Select an hour to see its consumption, cost and price.'}</p>
  </div>`;
}
