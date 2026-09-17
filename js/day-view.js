// Today / Tomorrow view. Content depends on the view mode:
//   simple – the essentials: appliance costs, best time, current price
//   full   – adds cheapest windows, chart and cost chips per price level
//   nerd   – adds price breakdown, statistics and an hourly table

import { classify, cheapestWindow, mostExpensiveWindow, periods, periodAt, levelSummary, actionableHours, stats, relativeFactors, ratio } from './prices.js';
import { priceHours } from './tariffs.js';
import { costPerHour, cycleOptions, unitLabel } from './appliances.js';
import { renderChart } from './chart.js';
import { esc, num, numShort, kr, hours as fmtHours } from './format.js';
import { formatHour, formatHourRange } from './time.js';
import { load, save } from './storage.js';
import { median, stdDev } from './stats.js';
import { LEVEL_LABEL, badge, factorPills, factorText, stateCard, rangeTiles } from './ui.js';
import { renderComingDays } from './outlook-view.js';

const APPLIANCES_OPEN_KEY = 'ui.appliancesOpen';

/**
 * @returns {{ html: string, mount: (container: HTMLElement) => void }}
 */
export function renderDayView(model, tab) {
  const day = model.days[tab];
  const isToday = tab === 'today';

  if (day.status === 'loading') return { html: stateCard({ title: 'Loading prices…', spinner: true }), mount() {} };
  if (day.status === 'notPublished') {
    return {
      html:
        stateCard({ icon: '🕐', title: "Tomorrow's prices are not published yet.", text: 'They are usually available around 13:00.' }) +
        renderComingDays(model),
      mount: (c) => wireComingDays(c, model),
    };
  }
  if (day.status !== 'ok') {
    return {
      html: stateCard({
        icon: '⚠️',
        title: 'Could not load prices.',
        text: esc(day.message ?? 'Unknown error'),
        action: '<button type="button" class="btn" data-action="refresh">Try again</button>',
      }),
      mount: (c) => c.querySelector('[data-action="refresh"]')?.addEventListener('click', model.onRefresh),
    };
  }

  const mode = model.settings.viewMode;
  const nowHour = isToday ? model.now.hour : null;
  const { hours: priced, tariffSource } = priceHours(model.settings, day.date, day.hours);
  const classified = classify(priced, model.window);
  const windowHours = classified.filter((h) => h.inWindow);
  const actionable = actionableHours(classified, { nowHour });
  const windowPeriods = periods(windowHours);

  const tomorrow = model.days.tomorrow;
  const tomorrowPriced = isToday && tomorrow.status === 'ok' ? priceHours(model.settings, tomorrow.date, tomorrow.hours).hours : null;

  const ctx = { model, day, mode, isToday, nowHour, classified, windowHours, actionable, windowPeriods, tomorrowPriced, tariffSource };

  const parts = [];
  parts.push(renderAppliances(ctx));
  if (!actionable.length) {
    parts.push(stateCard({ title: 'The day window is over for today.', text: "Check tomorrow's prices." }));
  } else {
    parts.push(renderOverview(ctx));
  }
  if (isToday) parts.push(renderNow(ctx));
  if (mode !== 'simple') parts.push(renderChartCard(ctx));
  if (mode === 'nerd') {
    parts.push(renderBreakdown(ctx));
    parts.push(renderStats(ctx));
    parts.push(renderHourTable(ctx));
  }
  parts.push(renderComingDays(model));

  return {
    html: parts.join(''),
    mount(container) {
      container.querySelector('#appliances-details')?.addEventListener('toggle', (e) => save(APPLIANCES_OPEN_KEY, e.target.open));
      container.querySelector('[data-action="settings-cta"]')?.addEventListener('click', model.onOpenSettings);
      if (mode !== 'simple') mountChart(container, ctx);
      wireComingDays(container, model);
    },
  };
}

function wireComingDays(container, model) {
  container.querySelectorAll('[data-action="open-outlook"]').forEach((el) => el.addEventListener('click', () => model.onSelectTab('outlook')));
}

// ---------------------------------------------------------------------------
// Appliances

function renderAppliances(ctx) {
  const { model, classified, actionable, nowHour, tomorrowPriced, mode } = ctx;
  const { appliances } = model;
  const open = load(APPLIANCES_OPEN_KEY, true) ? 'open' : '';

  if (!appliances.length) {
    return `
      <details class="card expander" id="appliances-details" ${open}>
        <summary><h2>Your appliances</h2></summary>
        <p class="muted">Add your appliances to see what they cost to run at different times.</p>
        <button type="button" class="btn btn-primary btn-block" data-action="settings-cta">Add appliance</button>
      </details>`;
  }
  if (!actionable.length) {
    return `
      <details class="card expander" id="appliances-details" ${open}>
        <summary><h2>Your appliances</h2><span class="muted">${appliances.length}</span></summary>
        <p class="muted">No hours left in your day window.</p>
      </details>`;
  }

  // Timeline for cycle appliances: selected day followed by the next day (if known),
  // so a cycle started late in the evening can be priced across midnight.
  const timeline = tomorrowPriced ? [...classified, ...tomorrowPriced] : [...classified];
  const candidateIndices = actionable.map((h) => classified.indexOf(h));
  const summary = levelSummary(actionable);
  const current = nowHour !== null ? classified.find((h) => h.hour === nowHour) : null;
  const cheapest = stats(actionable).min;

  const rows = appliances
    .map((a) => {
      if (mode === 'simple') return simpleRow(a, { timeline, candidateIndices, current, actionable });
      return a.mode === 'cycle' ? cycleRow(a, timeline, candidateIndices, current) : hourRow(a, summary, current, cheapest);
    })
    .join('');

  return `
    <details class="card expander" id="appliances-details" ${open}>
      <summary><h2>Your appliances</h2><span class="muted">${appliances.length}</span></summary>
      <ul class="${mode === 'simple' ? 'simple-list' : 'cost-list'}">${rows}</ul>
    </details>`;
}

/** One line per appliance: now, best and worst cost – the cheap/expensive contrast at a glance. */
function simpleRow(a, { timeline, candidateIndices, current, actionable }) {
  let now = null;
  let best = null;
  let worst = null;
  const unit = a.mode === 'cycle' ? '' : '/h';
  if (a.mode === 'cycle') {
    const options = cycleOptions(a, timeline, candidateIndices);
    best = options.best && { cost: options.best.cost, hour: options.best.hour };
    worst = options.worst && { cost: options.worst.cost, hour: options.worst.hour };
    const nowIdx = current ? timeline.indexOf(current) : -1;
    const nowOpt = nowIdx >= 0 ? cycleOptions(a, timeline, [nowIdx]).best : null;
    if (nowOpt) now = { cost: nowOpt.cost };
  } else {
    const s = stats(actionable);
    best = { cost: costPerHour(a, s.min.price), hour: s.min.hour };
    worst = { cost: costPerHour(a, s.max.price), hour: s.max.hour };
    if (current) now = { cost: costPerHour(a, current.price) };
  }
  if (!best) return `<li class="simple-row"><strong>${esc(a.name)}</strong><span class="muted">Not enough price data.</span></li>`;

  // Costs scale with consumption, so scale the "too close to zero" threshold too.
  const minRef = 0.05 * a.kwh;
  const nowFactor = now ? ratio(now.cost, best.cost, minRef) : null;
  const nowIsBest = now && now.cost <= best.cost * 1.05 + 1e-9;
  const worstFactor = worst ? ratio(worst.cost, best.cost, minRef) : null;
  const parts = [];
  if (now) parts.push(nowIsBest ? `<span class="good">✓ Now ${kr(now.cost)}${unit} – cheapest</span>` : `<span>Now ${kr(now.cost)}${unit}${factorTag(nowFactor)}</span>`);
  if (!nowIsBest) parts.push(`<span class="good">Best ${kr(best.cost)}${unit} at ${formatHour(best.hour)}</span>`);
  if (worst && worst.cost > best.cost * 1.05) parts.push(`<span class="bad">Worst ${kr(worst.cost)}${unit} at ${formatHour(worst.hour)}${worstFactor ? ` (${factorText(worstFactor)})` : ''}</span>`);
  return `
    <li class="simple-row">
      <strong>${esc(a.name)}</strong>
      <span class="simple-values">${parts.join('')}</span>
    </li>`;
}

function factorTag(value) {
  if (value == null || value < 1.05) return '';
  return ` <em class="factor-tag">${factorText(value)}</em>`;
}

function hourRow(a, summary, current, cheapest) {
  const cheapAvg = summary.find((s) => s.level === 'cheap')?.avg ?? cheapest.price;
  const chips = summary
    .map((lv) => {
      const f = lv.level === 'cheap' ? null : ratio(lv.avg, cheapAvg);
      return `
      <div class="chip level-${lv.level}">
        <span class="chip-label">${LEVEL_LABEL[lv.level]} · ${lv.periods.map((p) => formatHourRange(p.start, p.end)).join(', ')}</span>
        <span class="chip-value">${kr(costPerHour(a, lv.avg))}<small>/h</small>${f && f >= 1.05 ? `<span class="chip-factor">${factorText(f)}</span>` : ''}</span>
      </div>`;
    })
    .join('');
  let nowChip = '';
  if (current) {
    const f = ratio(current.price, cheapest.price);
    nowChip = `<div class="chip now"><span class="chip-label">Now${f && f >= 1.05 ? ` · ${factorText(f)} cheapest` : ' · cheapest'}</span><span class="chip-value">${kr(costPerHour(a, current.price))}<small>/h</small></span></div>`;
  }
  return `
    <li class="cost-row">
      <div class="cost-head"><strong>${esc(a.name)}</strong><span class="muted">${numShort(a.kwh)} ${unitLabel(a)}</span></div>
      <div class="chips">${nowChip}${chips}</div>
    </li>`;
}

function cycleRow(a, timeline, candidateIndices, current) {
  const { best, worst } = cycleOptions(a, timeline, candidateIndices);
  const nowIndex = current ? timeline.indexOf(current) : -1;
  const nowOption = nowIndex >= 0 ? cycleOptions(a, timeline, [nowIndex]).best : null;
  const meta = `${numShort(a.kwh)} ${unitLabel(a)}${a.durationHours ? ` · ${fmtHours(a.durationHours)}` : ''}`;

  let chips;
  if (!best) {
    chips = `<p class="muted">Not enough price data for a full cycle.</p>`;
  } else {
    const nowF = nowOption ? ratio(nowOption.cost, best.cost, 0.05 * a.kwh) : null;
    const worstF = worst ? ratio(worst.cost, best.cost, 0.05 * a.kwh) : null;
    chips = `
      ${nowOption ? `<div class="chip now"><span class="chip-label">Start now${nowF && nowF >= 1.05 ? ` · ${factorText(nowF)} best` : ' · best'}</span><span class="chip-value">${kr(nowOption.cost)}</span></div>` : ''}
      <div class="chip level-cheap"><span class="chip-label">Best start · ${formatHour(best.hour)}</span><span class="chip-value">${kr(best.cost)}</span></div>
      ${worst && worst.index !== best.index ? `<div class="chip level-expensive"><span class="chip-label">Worst start · ${formatHour(worst.hour)}</span><span class="chip-value">${kr(worst.cost)}${worstF && worstF >= 1.05 ? `<span class="chip-factor">${factorText(worstF)}</span>` : ''}</span></div>` : ''}`;
  }
  return `
    <li class="cost-row">
      <div class="cost-head"><strong>${esc(a.name)}</strong><span class="muted">${esc(meta)}</span></div>
      <div class="chips">${chips}</div>
    </li>`;
}

// ---------------------------------------------------------------------------
// Best time overview

function renderOverview(ctx) {
  const { model, mode, isToday, nowHour, actionable, windowPeriods, windowHours, tomorrowPriced } = ctx;
  const best3 = cheapestWindow(actionable, 3) ?? cheapestWindow(actionable, Math.min(3, actionable.length));
  const day = stats(windowHours); // the whole day window, also hours already passed

  let factorHtml = '';
  let factorNote = '';
  if (best3) {
    const worst = mostExpensiveWindow(actionable, best3.end - best3.start);
    const f = worst ? ratio(worst.avg, best3.avg) : null;
    if (f && f >= 1.05) {
      factorHtml = ` <span class="factor" title="The most expensive ${best3.end - best3.start} h cost this many times more">(factor ${num(f, 1)})</span>`;
      factorNote = ` · ${num(f, 1)}× cheaper than ${formatHourRange(worst.start, worst.end)} (~${num(worst.avg)})`;
    }
  }

  const headline = best3
    ? `Best time ${isToday ? 'today' : 'tomorrow'}: <strong>${formatHourRange(best3.start, best3.end)}</strong>${factorHtml}`
    : 'No hours left';

  let tomorrowHint = '';
  if (isToday && best3 && tomorrowPriced) {
    const tActionable = actionableHours(classify(tomorrowPriced, model.window));
    const tBest = cheapestWindow(tActionable, best3.end - best3.start);
    if (tBest && tBest.avg < best3.avg * 0.8) {
      tomorrowHint = `<p class="hint level-cheap">Cheaper tomorrow: <strong>${formatHourRange(tBest.start, tBest.end)}</strong> at ~${num(tBest.avg)} kr./kWh</p>`;
    }
  }

  const strip = windowPeriods
    .map((p) => {
      const past = isToday && p.end <= nowHour;
      const n = p.hours.length;
      const label = n >= 3 ? `<span class="seg-time">${formatHourRange(p.start, p.end)}</span><span class="seg-price">${num(p.avg)}</span>` : n === 2 ? `<span class="seg-time">${p.start}</span>` : '';
      return `<div class="seg level-${p.level} ${past ? 'past' : ''}" style="--n:${n}" title="${formatHourRange(p.start, p.end)} · ${num(p.avg)} kr./kWh">${label}</div>`;
    })
    .join('');

  const detail =
    mode === 'simple'
      ? best3 ? `${best3.end - best3.start} h at ~${num(best3.avg)} kr./kWh` : ''
      : `${best3 ? `${best3.end - best3.start} h at ~${num(best3.avg)} kr./kWh` : ''}${factorNote}`;

  const windows =
    mode === 'simple'
      ? ''
      : `<div class="windows">${[1, 2, 3, 4]
          .map((n) => ({ n, w: cheapestWindow(actionable, n) }))
          .filter((x) => x.w)
          .map(
            (x) => `
          <div class="win">
            <span class="win-len">${x.n} h</span>
            <span class="win-time">${formatHourRange(x.w.start, x.w.end)}</span>
            <span class="win-price muted">${num(x.w.avg)} kr./kWh</span>
          </div>`,
          )
          .join('')}</div>`;

  return `
    <section class="card overview">
      <p class="headline">${headline}</p>
      <p class="muted">${detail}</p>
      ${tomorrowHint}
      ${day ? rangeTiles({ low: day.min, high: day.max, avg: day.avg }) : ''}
      <div class="period-strip" aria-label="Price periods">${strip}</div>
      ${windows}
    </section>`;
}

// ---------------------------------------------------------------------------
// Now

function renderNow(ctx) {
  const { classified, windowPeriods, nowHour, actionable, mode } = ctx;
  const current = classified.find((h) => h.hour === nowHour);
  if (!current) return '';
  const period = periodAt(windowPeriods, nowHour);
  let hint = '';
  if (period) {
    const next = windowPeriods.find((p) => p.start >= period.end && p.level !== period.level);
    hint = `${LEVEL_LABEL[period.level]} until ${formatHour(period.end)}`;
    if (period.level !== 'cheap') {
      const nextCheap = windowPeriods.find((p) => p.start >= period.end && p.level === 'cheap');
      if (nextCheap) hint += ` · cheap from ${formatHour(nextCheap.start)}`;
      else if (next) hint += ` · then ${LEVEL_LABEL[next.level].toLowerCase()}`;
    }
  } else {
    hint = 'Outside your day window';
  }
  const reference = actionable.length ? actionable : classified.filter((h) => h.inWindow);
  const factors = relativeFactors(current.price, reference);
  const refNote =
    mode === 'simple' || !factors.cheapest
      ? ''
      : `<span class="now-ref muted">Cheapest ${formatHour(factors.cheapest.hour)} ${num(factors.cheapest.price)} · priciest ${formatHour(factors.priciest.hour)} ${num(factors.priciest.price)}</span>`;
  return `
    <section class="card now-card level-${current.level}">
      <div class="now-left">
        <span class="label">Now · ${formatHour(nowHour)}</span>
        <span class="now-price">${num(current.price)}<small> kr./kWh</small></span>
        <span class="now-hint">${esc(hint)}</span>
        ${factorPills(factors)}
        ${refNote}
      </div>
      ${badge(current.level)}
    </section>`;
}

// ---------------------------------------------------------------------------
// Chart

function renderChartCard(ctx) {
  const nerd = ctx.mode === 'nerd';
  return `
    <section class="card chart-card">
      <div class="card-head">
        <h2>Prices per hour</h2>
        <span class="chart-readout muted" id="chart-readout">Tap a bar</span>
      </div>
      <div id="chart"></div>
      <div class="legend">
        <span><i class="dot level-cheap"></i>Cheap</span>
        <span><i class="dot level-normal"></i>Normal</span>
        <span><i class="dot level-expensive"></i>Expensive</span>
        <span><i class="dot outside"></i>Outside window</span>
        ${nerd && ctx.model.settings.priceMode === 'full' ? '<span><i class="dot addon"></i>Tariffs, tax &amp; VAT</span>' : ''}
      </div>
    </section>`;
}

function mountChart(container, ctx) {
  const { model, classified, nowHour, mode } = ctx;
  const chartEl = container.querySelector('#chart');
  const readout = container.querySelector('#chart-readout');
  if (!chartEl) return;
  renderChart(chartEl, {
    hours: classified,
    max: model.settings.chartMax,
    nowHour,
    showAddOn: mode === 'nerd' && model.settings.priceMode === 'full',
    onSelect: (h) => {
      const spot = model.settings.priceMode === 'full' ? ` · spot ${num(h.spot)}` : '';
      readout.textContent = `${formatHour(h.hour)} · ${num(h.price)} kr./kWh${spot} · ${LEVEL_LABEL[h.level]}${h.price > model.settings.chartMax ? ' · over max' : ''}`;
      readout.classList.remove('muted');
    },
  });
}

// ---------------------------------------------------------------------------
// Nerd cards

function renderBreakdown(ctx) {
  const { model, classified, nowHour, windowHours, tariffSource } = ctx;
  const current = nowHour !== null ? classified.find((h) => h.hour === nowHour) : null;
  const avgParts = (hours) => {
    const keys = ['spot', 'system', 'net', 'tax', 'grid', 'surcharge', 'vat'];
    const out = {};
    for (const k of keys) out[k] = hours.reduce((s, h) => s + h.parts[k], 0) / hours.length;
    out.total = hours.reduce((s, h) => s + h.price, 0) / hours.length;
    return out;
  };
  const columns = [];
  if (current) columns.push({ label: `Now ${formatHour(nowHour)}`, p: { ...current.parts, total: current.price } });
  if (windowHours.length) columns.push({ label: 'Window avg', p: avgParts(windowHours) });

  const rows = [
    ['spot', 'Spot price'],
    ['system', 'Energinet system tariff'],
    ['net', 'Energinet net tariff'],
    ['tax', 'Electricity tax'],
    ['grid', 'Grid company tariff'],
    ['surcharge', 'Supplier surcharge'],
    ['vat', 'VAT 25 %'],
  ];
  const sourceNote = {
    exact: 'Tariffs for this day from stromligning.dk.',
    nearest: 'Tariffs copied from the nearest day with data.',
    default: 'No tariff data yet – using national 2026 defaults.',
  }[tariffSource];
  const grid = model.gridCompanyName ? `Grid company: ${esc(model.gridCompanyName)}.` : 'No grid company selected – grid tariff is 0.';

  return `
    <section class="card">
      <h2>Price breakdown <span class="muted">kr./kWh</span></h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th></th>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(([k, label]) => `<tr><td>${label}</td>${columns.map((c) => `<td>${num(c.p[k], 3)}</td>`).join('')}</tr>`).join('')}
            <tr class="total"><td>Total</td>${columns.map((c) => `<td>${num(c.p.total, 3)}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
      <p class="muted small-print">${model.settings.priceMode === 'spot' ? 'Spot mode: tariffs, tax and VAT are not included.' : `${sourceNote} ${grid}`}</p>
    </section>`;
}

function renderStats(ctx) {
  const { windowHours, classified } = ctx;
  if (!windowHours.length) return '';
  const prices = windowHours.map((h) => h.price);
  const spots = classified.map((h) => h.spot);
  const s = stats(windowHours);
  const rows = [
    ['Window average', `${num(s.avg, 3)}`],
    ['Median', `${num(median(prices), 3)}`],
    ['Std. deviation', `${num(stdDev(prices), 3)}`],
    ['Min', `${num(s.min.price, 3)} at ${formatHour(s.min.hour)}`],
    ['Max', `${num(s.max.price, 3)} at ${formatHour(s.max.hour)}`],
    ['Max ÷ min', s.min.price > 0.05 ? `${num(s.max.price / s.min.price, 2)}×` : '–'],
    ['24 h average', `${num(stats(classified).avg, 3)}`],
    ['24 h spot average', `${num(spots.reduce((a, b) => a + b, 0) / spots.length, 3)}`],
    ['Hours with negative spot', `${spots.filter((v) => v < 0).length}`],
  ];
  return `
    <section class="card">
      <h2>Statistics <span class="muted">kr./kWh</span></h2>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    </section>`;
}

function renderHourTable(ctx) {
  const { classified, nowHour } = ctx;
  const min = Math.min(...classified.filter((h) => h.inWindow).map((h) => h.price));
  return `
    <section class="card">
      <h2>All hours</h2>
      <div class="table-wrap">
        <table class="data-table hours-table">
          <thead><tr><th>Hour</th><th>Spot</th><th>Add-ons</th><th>Total</th><th>×min</th></tr></thead>
          <tbody>
            ${classified
              .map((h) => {
                const f = ratio(h.price, min);
                return `<tr class="${h.inWindow ? '' : 'outside'} ${h.hour === nowHour ? 'now' : ''}">
                  <td><i class="dot level-${h.level}"></i>${formatHour(h.hour)}</td>
                  <td>${num(h.spot, 3)}</td>
                  <td>${num(h.price - h.spot, 3)}</td>
                  <td><strong>${num(h.price, 3)}</strong></td>
                  <td>${f ? num(f, 2) : '–'}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}
