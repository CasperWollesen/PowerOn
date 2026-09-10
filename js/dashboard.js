// Dashboard view: "when should I use power?" at a glance.

import { classify, cheapestWindow, periods, periodAt, levelSummary, actionableHours, stats } from './prices.js';
import { costPerHour, cycleOptions, unitLabel } from './appliances.js';
import { renderChart } from './chart.js';
import { esc, num, numShort, kr, hours as fmtHours } from './format.js';
import { formatHour, formatHourRange, shortDate, weekdayName } from './time.js';

const LEVEL_LABEL = { cheap: 'Cheap', normal: 'Normal', expensive: 'Expensive' };

/**
 * @param {HTMLElement} container
 * @param {object} model
 * @param {object} model.settings
 * @param {{start:number,end:number}} model.window
 * @param {'today'|'tomorrow'} model.selectedDay
 * @param {{date:string,hour:number,minute:number}} model.now
 * @param {{today: DayState, tomorrow: DayState}} model.days   DayState = { status: 'loading'|'ok'|'notPublished'|'error', date, hours?, fromCache?, stale?, message? }
 * @param {Array} model.appliances
 * @param {function} model.onSelectDay
 * @param {function} model.onOpenSettings
 * @param {function} model.onRefresh
 */
export function renderDashboard(container, model) {
  const { selectedDay, days, now, window: win } = model;
  const day = days[selectedDay];
  const isToday = selectedDay === 'today';
  const nowHour = isToday ? now.hour : null;

  let body;
  if (day.status === 'ok') {
    body = renderDay(model, day, nowHour);
  } else if (day.status === 'loading') {
    body = `<section class="card state"><div class="spinner"></div><p>Loading prices…</p></section>`;
  } else if (day.status === 'notPublished') {
    body = `<section class="card state"><p class="big">🕐</p><p><strong>Tomorrow's prices are not published yet.</strong></p><p class="muted">They are usually available around 13:00.</p></section>`;
  } else {
    body = `<section class="card state"><p class="big">⚠️</p><p><strong>Could not load prices.</strong></p><p class="muted">${esc(day.message ?? 'Unknown error')}</p><button type="button" class="btn" data-action="refresh">Try again</button></section>`;
  }

  container.innerHTML = `
    <header class="topbar">
      <h1 class="brand">Power<span>On</span></h1>
      <span class="topbar-spacer"></span>
      <button type="button" class="icon-btn" data-action="settings" aria-label="Settings">${gearIcon()}</button>
    </header>
    <nav class="day-tabs" aria-label="Day">
      ${dayTab('today', 'Today', days.today, selectedDay)}
      ${dayTab('tomorrow', 'Tomorrow', days.tomorrow, selectedDay)}
    </nav>
    ${body}
    <footer class="foot muted">
      ${day.status === 'ok' ? dataNote(day) : ''}
      <span class="window-note">Day window ${formatHourRange(win.start, win.end)} · ${esc(model.settings.priceArea)}</span>
    </footer>
  `;

  container.querySelector('[data-action="settings"]').addEventListener('click', model.onOpenSettings);
  container.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => model.onSelectDay(b.dataset.day)));
  container.querySelector('[data-action="refresh"]')?.addEventListener('click', model.onRefresh);

  if (day.status === 'ok') {
    mountChart(container, model, day, nowHour);
  }
}

function dayTab(id, label, state, selected) {
  const sub = state.status === 'ok' ? `${weekdayName(state.date).slice(0, 3)} ${shortDate(state.date)}` : state.status === 'notPublished' ? 'from ~13:00' : state.status === 'loading' ? '…' : '';
  return `<button type="button" data-day="${id}" class="${id === selected ? 'active' : ''}" aria-pressed="${id === selected}">${label}<small>${esc(sub)}</small></button>`;
}

function dataNote(day) {
  if (day.stale) return '<span class="warn">Offline – showing last saved prices.</span> ';
  return '';
}

// ---------------------------------------------------------------------------

function renderDay(model, day, nowHour) {
  const { window: win, appliances } = model;
  const classified = classify(day.hours, win);
  const windowHours = classified.filter((h) => h.inWindow);
  const actionable = actionableHours(classified, { nowHour });
  const windowPeriods = periods(windowHours);
  const isToday = nowHour !== null;

  // Order: appliances first (the question the user actually has), then the
  // best-time overview, the current price, and finally the chart.
  const parts = [];

  parts.push(renderAppliances(model, classified, actionable, nowHour));

  if (!actionable.length) {
    parts.push(`<section class="card state"><p><strong>The day window is over for today.</strong></p><p class="muted">Check tomorrow's prices.</p></section>`);
  } else {
    parts.push(renderOverview(actionable, windowPeriods, windowHours, nowHour, isToday, model.days.tomorrow, win));
  }

  if (isToday) parts.push(renderNow(classified, windowPeriods, nowHour));

  parts.push(`
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
      </div>
    </section>`);

  return parts.join('');
}

function renderNow(classified, windowPeriods, nowHour) {
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
  return `
    <section class="card now-card level-${current.level}">
      <div class="now-left">
        <span class="label">Now · ${formatHour(nowHour)}</span>
        <span class="now-price">${num(current.price)}<small> kr./kWh</small></span>
        <span class="now-hint">${esc(hint)}</span>
      </div>
      <span class="badge level-${current.level}">${LEVEL_LABEL[current.level]}</span>
    </section>`;
}

function renderOverview(actionable, windowPeriods, windowHours, nowHour, isToday, tomorrowDay, win) {
  const best3 = cheapestWindow(actionable, 3) ?? cheapestWindow(actionable, Math.min(3, actionable.length));
  const s = stats(actionable);
  const windows = [1, 2, 3, 4]
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
    .join('');

  const total = windowHours.length;
  const strip = windowPeriods
    .map((p) => {
      const past = isToday && p.end <= nowHour;
      const n = p.hours.length;
      // Narrow segments cannot fit a label; the colour still tells the story.
      const label = n >= 3 ? `<span class="seg-time">${formatHourRange(p.start, p.end)}</span><span class="seg-price">${num(p.avg)}</span>` : n === 2 ? `<span class="seg-time">${p.start}</span>` : '';
      return `<div class="seg level-${p.level} ${past ? 'past' : ''}" style="--w:${(n / total) * 100}%" title="${formatHourRange(p.start, p.end)} · ${num(p.avg)} kr./kWh">${label}</div>`;
    })
    .join('');

  const headline = best3
    ? `Best time ${isToday ? 'today' : 'tomorrow'}: <strong>${formatHourRange(best3.start, best3.end)}</strong>`
    : 'No hours left';

  // When today's remaining hours are poor and tomorrow is clearly better, say so.
  let tomorrowHint = '';
  if (isToday && best3 && tomorrowDay?.status === 'ok') {
    const tomorrowActionable = actionableHours(classify(tomorrowDay.hours, win));
    const tBest = cheapestWindow(tomorrowActionable, best3.end - best3.start);
    if (tBest && tBest.avg < best3.avg * 0.8) {
      tomorrowHint = `<p class="hint level-cheap">Cheaper tomorrow: <strong>${formatHourRange(tBest.start, tBest.end)}</strong> at ~${num(tBest.avg)} kr./kWh</p>`;
    }
  }

  return `
    <section class="card overview">
      <p class="headline">${headline}</p>
      <p class="muted">${best3 ? `${best3.end - best3.start} h at ~${num(best3.avg)} kr./kWh` : ''}${s ? ` · cheapest hour ${formatHour(s.min.hour)} (${num(s.min.price)}) · most expensive ${formatHour(s.max.hour)} (${num(s.max.price)})` : ''}</p>
      ${tomorrowHint}
      <div class="period-strip" aria-label="Price periods">${strip}</div>
      <div class="windows">${windows}</div>
    </section>`;
}

function renderAppliances(model, classified, actionable, nowHour) {
  const { appliances, days, selectedDay } = model;
  if (!appliances.length) {
    return `
      <section class="card">
        <h2>Your appliances</h2>
        <p class="muted">Add your appliances to see what they cost to run at different times.</p>
        <button type="button" class="btn btn-primary btn-block" data-action="settings-cta">Add appliance</button>
      </section>`;
  }

  // Timeline for cycle appliances: selected day followed by the next day (if we have it),
  // so a cycle started late in the evening can be priced across midnight.
  const timeline = [...classified];
  if (selectedDay === 'today' && days.tomorrow.status === 'ok') {
    timeline.push(...days.tomorrow.hours);
  }
  // Actionable hours are the same objects as in `classified`, which is the head of the timeline.
  const candidateIndices = actionable.map((h) => classified.indexOf(h));
  const summary = levelSummary(actionable);
  const current = nowHour !== null ? classified.find((h) => h.hour === nowHour) : null;

  const rows = appliances.map((a) => (a.mode === 'cycle' ? cycleRow(a, timeline, candidateIndices, nowHour) : hourRow(a, summary, current))).join('');

  return `
    <section class="card">
      <h2>Your appliances</h2>
      <ul class="cost-list">${rows}</ul>
    </section>`;
}

function hourRow(a, summary, current) {
  const chips = summary
    .map(
      (lv) => `
      <div class="chip level-${lv.level}">
        <span class="chip-label">${LEVEL_LABEL[lv.level]} · ${lv.periods.map((p) => formatHourRange(p.start, p.end)).join(', ')}</span>
        <span class="chip-value">${kr(costPerHour(a, lv.avg))}<small>/h</small></span>
      </div>`,
    )
    .join('');
  const nowChip = current
    ? `<div class="chip now"><span class="chip-label">Now</span><span class="chip-value">${kr(costPerHour(a, current.price))}<small>/h</small></span></div>`
    : '';
  return `
    <li class="cost-row">
      <div class="cost-head"><strong>${esc(a.name)}</strong><span class="muted">${numShort(a.kwh)} ${unitLabel(a)}</span></div>
      <div class="chips">${nowChip}${chips}</div>
    </li>`;
}

function cycleRow(a, timeline, candidateIndices, nowHour) {
  const { best, worst } = cycleOptions(a, timeline, candidateIndices);
  const nowIndex = nowHour !== null ? candidateIndices.find((i) => timeline[i]?.hour === nowHour) : undefined;
  const nowOption = nowIndex !== undefined ? cycleOptions(a, timeline, [nowIndex]).best : null;
  const meta = `${numShort(a.kwh)} ${unitLabel(a)}${a.durationHours ? ` · ${fmtHours(a.durationHours)}` : ''}`;

  let chips;
  if (!best) {
    chips = `<p class="muted">Not enough price data for a full cycle.</p>`;
  } else {
    chips = `
      ${nowOption ? `<div class="chip now"><span class="chip-label">Start now</span><span class="chip-value">${kr(nowOption.cost)}</span></div>` : ''}
      <div class="chip level-cheap"><span class="chip-label">Best start · ${formatHour(best.hour)}</span><span class="chip-value">${kr(best.cost)}</span></div>
      ${worst && worst.index !== best.index ? `<div class="chip level-expensive"><span class="chip-label">Worst start · ${formatHour(worst.hour)}</span><span class="chip-value">${kr(worst.cost)}</span></div>` : ''}`;
  }
  return `
    <li class="cost-row">
      <div class="cost-head"><strong>${esc(a.name)}</strong><span class="muted">${esc(meta)}</span></div>
      <div class="chips">${chips}</div>
    </li>`;
}

function mountChart(container, model, day, nowHour) {
  const chartEl = container.querySelector('#chart');
  const readout = container.querySelector('#chart-readout');
  const classified = classify(day.hours, model.window);
  renderChart(chartEl, {
    hours: classified,
    max: model.settings.chartMax,
    nowHour,
    onSelect: (h) => {
      readout.textContent = `${formatHour(h.hour)} · ${num(h.price)} kr./kWh · ${LEVEL_LABEL[h.level]}${h.price > model.settings.chartMax ? ' · over max' : ''}`;
      readout.classList.remove('muted');
    },
  });
  container.querySelector('[data-action="settings-cta"]')?.addEventListener('click', model.onOpenSettings);
}

function gearIcon() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
}
