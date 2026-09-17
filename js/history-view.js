// History: past days stored on this device, with prices and weather side by side.

import { cachedDates, cachedDay } from './api.js';
import { cachedWeather } from './weather.js';
import { priceHours } from './tariffs.js';
import { classify, cheapestWindow, stats } from './prices.js';
import { renderChart } from './chart.js';
import { quantile } from './stats.js';
import { num } from './format.js';
import { formatHour, formatHourRange, shortDate, weekdayName } from './time.js';
import { LEVEL_LABEL, badge, stateCard } from './ui.js';

const PAGE = 14;
let visibleCount = PAGE; // survives re-renders within the session

function summarizeDay(model, date, weatherDays) {
  const spot = cachedDay(model.settings.priceArea, date);
  if (!spot) return null;
  const { hours } = priceHours(model.settings, date, spot.hours);
  const classified = classify(hours, model.window);
  const win = classified.filter((h) => h.inWindow);
  if (!win.length) return null;
  const s = stats(win);
  return {
    date,
    classified,
    avg: s.avg,
    min: s.min,
    max: s.max,
    best3: cheapestWindow(win, 3),
    weather: weatherDays?.[date] ?? null,
  };
}

export function renderHistoryView(model) {
  const { settings, now, insights } = model;
  const mode = settings.viewMode;
  const weatherDays = cachedWeather()?.days ?? {};
  const dates = cachedDates(settings.priceArea).filter((d) => d < now.date);

  if (!dates.length) {
    const progress = insights.progress?.total ? ` (${insights.progress.done}/${insights.progress.total})` : '';
    return {
      html: stateCard({ title: `Collecting price history${progress}…`, spinner: insights.status === 'loading', text: 'Days are stored on this device as the app loads them.' }),
      mount() {},
    };
  }

  const chartDays = mode === 'nerd' ? 90 : 30;
  const summaries = dates.slice(0, Math.max(chartDays, visibleCount)).map((d) => summarizeDay(model, d, weatherDays)).filter(Boolean);
  const chartSet = summaries.slice(0, chartDays).reverse(); // oldest → newest

  // Levels relative to the shown period.
  const avgs = chartSet.map((s) => s.avg);
  const q33 = quantile(avgs, 1 / 3);
  const q67 = quantile(avgs, 2 / 3);
  const levelOf = (avg) => (avg <= q33 ? 'cheap' : avg >= q67 ? 'expensive' : 'normal');

  const scaleMax = settings.chartMax / 2; // fixed scale for daily averages
  const bars = chartSet
    .map((s) => {
      const pct = (Math.max(0, Math.min(s.avg, scaleMax)) / scaleMax) * 100;
      return `<div class="hbar level-${levelOf(s.avg)} ${s.avg > scaleMax ? 'over-max' : ''}" style="--h:${pct}%" title="${weekdayName(s.date).slice(0, 3)} ${shortDate(s.date)} · ${num(s.avg)} kr./kWh"></div>`;
    })
    .join('');
  const strip = (key, cls, scale) =>
    chartSet
      .map((s) => {
        const v = s.weather?.[key];
        const alpha = v == null ? 0 : Math.max(0.08, Math.min(1, v / scale));
        return `<div class="${cls}" style="--a:${alpha}" title="${v == null ? 'no data' : num(v, 2)}"></div>`;
      })
      .join('');
  const avgAll = avgs.reduce((a, b) => a + b, 0) / (avgs.length || 1);

  const chartCard = `
    <section class="card">
      <div class="card-head"><h2>Last ${chartSet.length} days</h2><span class="muted">avg ${num(avgAll)} kr./kWh</span></div>
      <div class="history-chart">
        <div class="hc-scale"><span>${num(scaleMax, 0)}</span><span>${num(scaleMax / 2, 1)}</span><span>0</span></div>
        <div class="hc-body">
          <div class="hc-bars" style="--n:${chartSet.length}">${bars}</div>
          ${mode === 'simple' ? '' : `<div class="hc-strip wind" style="--n:${chartSet.length}">${strip('windDk', 'ws', 0.7)}</div><div class="hc-strip sun" style="--n:${chartSet.length}">${strip('solarDk', 'ss', 6)}</div>`}
        </div>
      </div>
      <div class="legend">
        <span>Daily average in your window (${formatHourRange(model.window.start, model.window.end)})</span>
        ${mode === 'simple' ? '' : '<span><i class="dot wind"></i>Wind</span><span><i class="dot sun"></i>Sun</span>'}
      </div>
    </section>`;

  const listItems = summaries
    .slice(0, visibleCount)
    .map((s) => {
      const w = s.weather;
      const weather = w
        ? `<span class="muted">💨 ${Math.round(w.windDk * 100)} % · ☀️ ${num(w.solarDk, 1)} · 🌡 ${num(w.tempDk, 0)}°</span>`
        : '';
      return `
      <details class="history-day" data-date="${s.date}">
        <summary>
          <div class="hd-main">
            <span><strong>${weekdayName(s.date).slice(0, 3)}</strong> ${shortDate(s.date)}</span>
            <span class="hd-price">${num(s.avg)} <small>kr./kWh</small></span>
          </div>
          <div class="hd-sub">
            ${badge(levelOf(s.avg), LEVEL_LABEL[levelOf(s.avg)])}
            <span class="muted">${s.best3 ? `cheapest ${formatHourRange(s.best3.start, s.best3.end)} ~${num(s.best3.avg)}` : ''}</span>
            ${mode === 'simple' ? '' : weather}
          </div>
        </summary>
        <div class="hd-detail">
          <div class="hd-chart"></div>
          <p class="muted small-print">Min ${num(s.min.price)} at ${formatHour(s.min.hour)} · max ${num(s.max.price)} at ${formatHour(s.max.hour)}${w && mode === 'nerd' ? ` · wind DK ${Math.round(w.windDk * 100)} % / DE ${Math.round(w.windDe * 100)} % · sun DK ${num(w.solarDk, 1)} / DE ${num(w.solarDe, 1)} kWh/m²` : ''}</p>
        </div>
      </details>`;
    })
    .join('');

  const more = dates.length > visibleCount ? `<button type="button" class="btn btn-block" data-action="history-more">Show more (${dates.length - visibleCount} older)</button>` : '';

  const html = `
    ${chartCard}
    <section class="card">
      <div class="card-head"><h2>Days</h2><span class="muted">${dates.length} stored</span></div>
      <div class="history-list">${listItems}</div>
      ${more}
      <p class="muted small-print">${settings.priceMode === 'full' ? 'Past days use the tariffs closest in time that are stored on this device, so older days are approximate.' : 'Spot prices excl. VAT.'} Clearing site data removes the history.</p>
    </section>`;

  return {
    html,
    mount(container) {
      const byDate = new Map(summaries.map((s) => [s.date, s]));
      container.querySelectorAll('.history-day').forEach((el) => {
        el.addEventListener('toggle', () => {
          if (!el.open || el.dataset.rendered) return;
          const s = byDate.get(el.dataset.date);
          if (!s) return;
          renderChart(el.querySelector('.hd-chart'), { hours: s.classified, max: settings.chartMax, nowHour: null });
          el.dataset.rendered = '1';
        });
      });
      container.querySelector('[data-action="history-more"]')?.addEventListener('click', () => {
        visibleCount += 30;
        model.onRerender();
      });
    },
  };
}

export function historyDayCount(area, todayDate) {
  return cachedDates(area).filter((d) => d < todayDate).length;
}

