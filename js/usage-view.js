import { esc, num, kwh, kr } from './format.js';
import { addDays, danishMidnight, shortDate, weekdayName } from './time.js';
import { bandEdges } from './bands.js';
import { priceHours } from './tariffs.js';
import { analyseUsage, analyseDays } from './usage.js';

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
      content = summary(report, approximate, settings, analyseDays(u.intervals, prices, bandEdges(settings), days));
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
    },
  };
}

// @req USE-02 USE-03 USE-04
function summary(r, approximate, settings, days) {
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
  ${daily(days)}
  <section class="card"><h2>About these numbers</h2><p class="muted">${settings.priceMode === 'spot' ? 'Spot costs exclude tariffs, taxes, supplier surcharge and VAT.' :
    'Full-price estimates use your current grid company and supplier surcharge, plus the existing hourly tariff model. Subscription fees are excluded.'}
    ${approximate ? 'Some historical tariffs are missing: nearest stored tariffs or national defaults are used, which can also change the assigned bands.' : ''}
    ${r.split ? 'Consumption spanning price intervals is split assuming uniform use within the reading.' : ''} These figures are not an electricity bill.</p>
    ${settings.viewMode === 'nerd' ? `<p class="muted">Covered: ${esc(num(r.coveredMs / 3600000, 2))} hours. Significant means at least 20% of reported kWh in Expensive or Extreme.</p>` : ''}
  </section>`;
}

// @req USE-05
function daily(days) {
  return `<section class="card"><h2>Daily breakdown</h2>
    <p class="muted">Newest first · Danish days · only the price bands you actually used.</p>
    <div class="usage-days">${days.map((d) => `<div class="usage-day">
      <div class="usage-band-head"><strong>${esc(weekdayName(d.date))} ${esc(shortDate(d.date))}</strong>
        <strong>${d.total > 0 ? `${esc(kwh(d.total))} · ${d.priced > 0 ? esc(kr(d.cost)) : 'no prices'}` : 'No readings'}</strong></div>
      ${d.bands.map((b) => `<div class="usage-day-band band-${esc(b.id)}"><span>${esc(b.icon)} ${esc(b.label)}</span><span>${esc(kwh(b.kwh))}</span><span>${esc(kr(b.cost))}</span></div>`).join('')}
      ${d.unpriced > 0.000001 ? `<div class="usage-day-band"><span>Unpriced</span><span>${esc(kwh(d.unpriced))}</span><span>–</span></div>` : ''}
    </div>`).join('')}</div>
  </section>`;
}
