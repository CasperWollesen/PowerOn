// Outlook: expected prices for the coming days, estimated from the weather
// forecast. Also exports the compact "Coming days" strip used on the day view.

import { tariffProfileFor, addOnForWindow, priceHours } from './tariffs.js';
import { driverTags } from './forecast.js';
import { cheapestWindow, actionableHours, classify } from './prices.js';
import { esc, num } from './format.js';
import { formatHour, formatHourRange, shortDate, weekdayName } from './time.js';
import { bandRangeBadge, factorText, stateCard, priceRange } from './ui.js';
import { bandEdges, bandFor, bandLabel } from './bands.js';

/** Convert a forecast day (spot, kr./kWh) to displayed prices for the user's price model. */
// @req OUT-05
function displayDay(model, day) {
  const profile = tariffProfileFor(model.settings.priceArea, model.settings.gridCompany, day.date);
  const addOn = addOnForWindow(model.settings, profile, model.window);
  const edges = bandEdges(model.settings);
  const conv = (v, add) => (v + add) * addOn.factor;
  const bandOf = (v, add) => bandFor(conv(v, add), edges);
  return {
    band: bandOf(day.meanWin.value, addOn.avg),
    lowBand: bandOf(day.min1.value, addOn.min1),
    highBand: bandOf(day.max1.value, addOn.max1),
    avg: conv(day.meanWin.value, addOn.avg),
    avgLow: conv(day.meanWin.low, addOn.avg),
    avgHigh: conv(day.meanWin.high, addOn.avg),
    min3: conv(day.min3.value, addOn.min3),
    min3Low: conv(day.min3.low, addOn.min3),
    min3High: conv(day.min3.high, addOn.min3),
    low: conv(day.min1.value, addOn.min1),
    high: conv(day.max1.value, addOn.max1),
    addOn,
  };
}

function referenceAvgDisplay(model, forecast) {
  if (!forecast?.reference?.avg30) return null;
  const profile = tariffProfileFor(model.settings.priceArea, model.settings.gridCompany, model.now.date);
  const addOn = addOnForWindow(model.settings, profile, model.window);
  return (forecast.reference.avg30 + addOn.avg) * addOn.factor;
}

/** Known days (today, tomorrow) in the same shape as forecast days. */
function knownDays(model) {
  const out = [];
  for (const tab of ['today', 'tomorrow']) {
    const day = model.days[tab];
    if (day.status !== 'ok') continue;
    const { hours } = priceHours(model.settings, day.date, day.hours);
    const actionable = actionableHours(classify(hours, model.window, bandEdges(model.settings)));
    const best = cheapestWindow(actionable, 3);
    const avg = actionable.reduce((s, h) => s + h.price, 0) / (actionable.length || 1);
    const low = actionable.reduce((m, h) => (h.price < m.price ? h : m), actionable[0]);
    const high = actionable.reduce((m, h) => (h.price > m.price ? h : m), actionable[0]);
    const edges = bandEdges(model.settings);
    out.push({
      date: day.date,
      known: true,
      tab,
      avg,
      band: bandFor(avg, edges),
      lowBand: low ? low.band : 'fair',
      highBand: high ? high.band : 'fair',
      low: low?.price,
      lowHour: low?.hour,
      high: high?.price,
      highHour: high?.hour,
      min3: best?.avg ?? null,
      best,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compact strip for the day view

// @req OUT-08
export function renderComingDays(model) {
  const { forecast, insights } = model;
  const header = `<div class="card-head"><h2>Coming days</h2><button type="button" class="link-btn" data-action="open-outlook">Outlook ›</button></div>`;

  if (!forecast || forecast.status !== 'ok') {
    let text = 'Learning from past prices and weather…';
    if (insights.status === 'error') text = 'Could not load weather data for the outlook.';
    else if (forecast?.status === 'insufficient') text = `Collecting price history (${forecast.trainingDays}/${forecast.needed} days)…`;
    else if (insights.progress?.total) text = `Loading price history ${insights.progress.done}/${insights.progress.total}…`;
    return `<section class="card coming">${header}<p class="muted">${esc(text)}</p></section>`;
  }

  const days = forecast.days.slice(0, 6);
  if (!days.length) return '';
  const pills = days
    .map((d) => {
      const disp = displayDay(model, d);
      return `
        <button type="button" class="day-pill band-${disp.band}" data-action="open-outlook" title="${esc(bandLabel(disp.band))} · ${esc(weekdayName(d.date))}">
          <span class="dp-day">${weekdayName(d.date).slice(0, 3)}</span>
          <span class="dp-low">${num(disp.low, 1)}</span>
          <span class="dp-high">${num(disp.high, 1)}</span>
          <span class="dp-icon">${disp.lowBand === 'free' ? '⚡' : driverTags(d.weather, d.offDay)[0]?.icon ?? ''}</span>
        </button>`;
    })
    .join('');
  return `
    <section class="card coming">
      ${header}
      <div class="day-pills">${pills}</div>
      <p class="muted small-print">Estimated lowest and highest hour in your day window, kr./kWh. The colour is the band of the day's average.</p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Full outlook tab

// @req OUT-06 OUT-07
export function renderOutlookView(model) {
  const { forecast, insights, settings } = model;
  const mode = settings.viewMode;

  if (!forecast) {
    const progress = insights.progress?.total ? ` (${insights.progress.done}/${insights.progress.total} days)` : '';
    if (insights.status === 'error') {
      return {
        html: stateCard({ icon: '⚠️', title: 'Could not build the outlook.', text: esc(insights.message ?? ''), action: '<button type="button" class="btn" data-action="retry-insights">Try again</button>' }),
        mount: (c) => c.querySelector('[data-action="retry-insights"]')?.addEventListener('click', model.onRetryInsights),
      };
    }
    return { html: stateCard({ title: `Learning from past prices and weather${progress}…`, spinner: true, text: 'The first time takes a few seconds. After that it is cached on this device.' }), mount() {} };
  }
  if (forecast.status === 'insufficient') {
    return {
      html: stateCard({ icon: '📚', title: 'Not enough history yet.', text: `The outlook needs ${forecast.needed} days of prices with weather data. Have ${forecast.trainingDays}.` }),
      mount() {},
    };
  }

  const refDisplay = referenceAvgDisplay(model, forecast);
  const known = knownDays(model);
  const predicted = forecast.days.filter((d) => !known.some((k) => k.date === d.date)).map((d) => ({ ...d, disp: displayDay(model, d) }));

  // Best coming day for flexible loads: lowest expected cheapest-3h price, excluding today.
  const candidates = [
    ...known.filter((k) => k.tab === 'tomorrow' && k.min3 != null).map((k) => ({ date: k.date, min3: k.min3, avg: k.avg, low: k.low, high: k.high, band: k.band, lowBand: k.lowBand, highBand: k.highBand, known: true })),
    ...predicted.map((d) => ({ date: d.date, min3: d.disp.min3, avg: d.disp.avg, low: d.disp.low, high: d.disp.high, band: d.disp.band, lowBand: d.disp.lowBand, highBand: d.disp.highBand, known: false })),
  ];
  const bestDay = candidates.reduce((best, c) => (!best || c.min3 < best.min3 ? c : best), null);

  const parts = [];
  if (bestDay) {
    const f = refDisplay ? bestDay.avg / refDisplay : null;
    parts.push(`
      <section class="card overview">
        <p class="headline">Best coming day: <strong>${weekdayName(bestDay.date)} ${shortDate(bestDay.date)}</strong></p>
        <p class="range-line">${priceRange(bestDay.low, bestDay.high, { approx: !bestDay.known })} <small>kr./kWh</small></p>
        <p class="band-line">${bandRangeBadge(bestDay.lowBand, bestDay.highBand)}</p>
        <p class="muted">${bestDay.known ? 'Known prices' : 'Estimate'} · cheapest 3 h ~${num(bestDay.min3)} · average ~${num(bestDay.avg)}${f ? ` · ${factorText(f)} your 30-day average` : ''}</p>
      </section>`);
  }

  const rows = [
    ...known.map((k) => knownRow(k, refDisplay)),
    ...predicted.map((d) => predictedRow(d, refDisplay, mode)),
  ].join('');

  parts.push(`
    <section class="card">
      <div class="card-head"><h2>Next days</h2>${refDisplay ? `<span class="muted">30-day avg ${num(refDisplay)}</span>` : ''}</div>
      <ul class="outlook-list">${rows}</ul>
      <p class="muted small-print">Estimates come from the weather forecast (wind and sun in Denmark and Germany, temperature, weekends) and the last ${forecast.trainingDays} days of prices. They get less certain further ahead, and the highest hour is harder to predict than the lowest. Prices ${settings.priceMode === 'full' ? 'include tariffs, tax and VAT' : 'are spot prices'}.</p>
    </section>`);

  if (mode === 'nerd') parts.push(renderModelCard(forecast, predicted));

  return {
    html: parts.join(''),
    mount(container) {
      container.querySelectorAll('[data-open-tab]').forEach((el) => el.addEventListener('click', () => model.onSelectTab(el.dataset.openTab)));
    },
  };
}

function knownRow(k, refDisplay) {
  const f = refDisplay ? k.avg / refDisplay : null;
  return `
    <li class="outlook-row" data-open-tab="${k.tab}" role="button" tabindex="0">
      <div class="or-main">
        <span class="or-date"><strong>${weekdayName(k.date)}</strong> ${shortDate(k.date)} <span class="tag">Known</span></span>
        <span class="or-price">${priceRange(k.low, k.high)}</span>
      </div>
      <div class="or-sub">
        ${bandRangeBadge(k.lowBand, k.highBand)}
        <span class="muted">low ${formatHour(k.lowHour)} · high ${formatHour(k.highHour)} · avg ${num(k.avg)} (${bandLabel(k.band).toLowerCase()}${f ? `, ${factorText(f)} 30-day` : ''})${k.best ? ` · cheapest 3 h ${formatHourRange(k.best.start, k.best.end)}` : ''}</span>
      </div>
    </li>`;
}

function predictedRow(d, refDisplay, mode) {
  const f = refDisplay ? d.disp.avg / refDisplay : null;
  const tags = driverTags(d.weather, d.offDay)
    .map((t) => `<span class="tag">${t.icon} ${esc(t.text)}</span>`)
    .join('');
  const w = d.weather;
  const weatherLine =
    mode === 'simple' || !w
      ? ''
      : `<span class="muted or-weather">💨 ${Math.round(w.windDk * 100)} % · ☀️ ${num(w.solarDk, 1)} kWh/m² · 🌡 ${num(w.tempDk, 0)}°</span>`;
  return `
    <li class="outlook-row">
      <div class="or-main">
        <span class="or-date"><strong>${weekdayName(d.date)}</strong> ${shortDate(d.date)}</span>
        <span class="or-price">${priceRange(d.disp.low, d.disp.high, { approx: true })}</span>
      </div>
      <div class="or-sub">
        ${bandRangeBadge(d.disp.lowBand, d.disp.highBand)}
        <span class="muted">avg ~${num(d.disp.avg)} (${bandLabel(d.disp.band).toLowerCase()}${f ? `, ${factorText(f)} 30-day` : ''}) · cheapest 3 h ~${num(d.disp.min3)}${mode === 'nerd' ? ` · avg likely ${num(d.disp.avgLow)}–${num(d.disp.avgHigh)}` : ''}</span>
      </div>
      ${mode === 'simple' ? '' : `<div class="or-tags">${tags}${weatherLine}</div>`}
    </li>`;
}

// @req OUT-10
function renderModelCard(forecast, predicted) {
  const v = forecast.validation;
  const weights = forecast.weights
    .map((w) => `<tr><td>${esc(w.label)}</td><td>${w.weight >= 0 ? '+' : ''}${num(w.weight, 3)}</td></tr>`)
    .join('');
  const featureRows = predicted
    .map((d) => {
      const w = d.weather;
      const top = [...d.contributions]
        .filter((c) => c.key !== 'anchor')
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 2)
        .map((c) => `${c.label} ${c.value >= 0 ? '+' : ''}${num(c.value, 2)}`)
        .join(', ');
      return `<tr>
        <td>${weekdayName(d.date).slice(0, 3)} ${shortDate(d.date)}</td>
        <td>${Math.round(w.windDk * 100)}/${Math.round(w.windDe * 100)}</td>
        <td>${num(w.solarDk, 1)}/${num(w.solarDe, 1)}</td>
        <td>${num(w.tempDk, 0)}</td>
        <td>${num(d.min1.value, 2)}</td>
        <td>${num(d.meanWin.value, 2)}</td>
        <td>${num(d.max1.value, 2)}</td>
        <td>${num(d.min3.value, 2)}</td>
        <td class="small-print">${esc(top)}</td>
      </tr>`;
    })
    .join('');
  return `
    <section class="card">
      <h2>Model</h2>
      <dl class="kv">
        <dt>Training days</dt><dd>${forecast.trainingDays} (${shortDate(forecast.trainingFrom)}–${shortDate(forecast.trainingTo)})</dd>
        <dt>14-day spot level</dt><dd>${num(forecast.anchor, 3)} kr./kWh</dd>
        <dt>R² (window avg, in-sample)</dt><dd>${num(forecast.r2, 2)}</dd>
        <dt>Validation MAE, window avg</dt><dd>${v.meanWin ? `${num(v.meanWin.mae, 3)} kr. (n=${v.meanWin.n})` : '–'}</dd>
        <dt>Validation MAE, cheapest 3 h</dt><dd>${v.min3 ? `${num(v.min3.mae, 3)} kr. (n=${v.min3.n})` : '–'}</dd>
        <dt>Validation MAE, lowest hour</dt><dd>${v.min1 ? `${num(v.min1.mae, 3)} kr. (n=${v.min1.n})` : '–'}</dd>
        <dt>Validation MAE, highest hour</dt><dd>${v.max1 ? `${num(v.max1.mae, 3)} kr. (n=${v.max1.n})` : '–'}</dd>
        <dt>Latest known prices</dt><dd>${shortDate(forecast.latestKnownDate)}</dd>
      </dl>
      <h3>Weights <span class="muted">kr./kWh per std. dev.</span></h3>
      <div class="table-wrap"><table class="data-table"><tbody>${weights}</tbody></table></div>
      <h3>Inputs and spot estimates</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Day</th><th>Wind DK/DE %</th><th>Sun DK/DE</th><th>°C</th><th>Low</th><th>Avg</th><th>High</th><th>Min 3 h</th><th>Top drivers</th></tr></thead>
          <tbody>${featureRows}</tbody>
        </table>
      </div>
      <p class="muted small-print">Ridge regression, walk-forward validated on the latest days. Spot values excl. tariffs and VAT. Weather: Open-Meteo.</p>
    </section>`;
}

