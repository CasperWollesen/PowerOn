// History: past days stored on this device, with prices and weather side by side.
// Each day is shown by its lowest and highest hour first; the average is secondary.
// @req HIST-01 HIST-02 HIST-03 HIST-04 HIST-05

import { cachedDates, cachedDay } from './api.js';
import { cachedWeather } from './weather.js';
import { priceHours } from './tariffs.js';
import { classify, cheapestWindow, stats } from './prices.js';
import { renderChart } from './chart.js';
import { quantile } from './stats.js';
import { num } from './format.js';
import { formatHour, formatHourRange, shortDate, weekdayName } from './time.js';
import { LEVEL_LABEL, badge, stateCard, priceRange } from './ui.js';

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

  // Range bars: from the day's lowest to highest hour, with a tick at the average.
  // Fixed scale (half the hourly chart maximum) so periods stay comparable.
  const scaleMax = settings.chartMax / 2;
  const pctOf = (v) => (Math.max(0, Math.min(v, scaleMax)) / scaleMax) * 100;
  const bars = chartSet
    .map((s) => {
      const lo = pctOf(s.min.price);
      const hi = pctOf(s.max.price);
      const avg = pctOf(s.avg);
      const title = `${weekdayName(s.date).slice(0, 3)} ${shortDate(s.date)} · low ${num(s.min.price)} · high ${num(s.max.price)} · avg ${num(s.avg)}`;
      return `<div class="hbar-slot" title="${title}"><div class="hbar level-${levelOf(s.avg)} ${s.max.price > scaleMax ? 'over-max' : ''}" style="--lo:${lo}%;--hi:${hi}%"></div><div class="hbar-avg" style="--avg:${avg}%"></div></div>`;
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
  const periodLow = chartSet.reduce((m, s) => (s.min.price < m.min.price ? s : m), chartSet[0]);
  const periodHigh = chartSet.reduce((m, s) => (s.max.price > m.max.price ? s : m), chartSet[0]);

  const chartCard = `
    <section class="card">
      <div class="card-head"><h2>Last ${chartSet.length} days</h2><span class="muted">${priceRange(periodLow.min.price, periodHigh.max.price)} kr./kWh</span></div>
      <div class="history-chart">
        <div class="hc-scale"><span>${num(scaleMax, 0)}</span><span>${num(scaleMax / 2, 1)}</span><span>0</span></div>
        <div class="hc-body">
          <div class="hc-bars" style="--n:${chartSet.length}">${bars}</div>
          ${mode === 'simple' ? '' : `<div class="hc-strip wind" style="--n:${chartSet.length}">${strip('windDk', 'ws', 0.7)}</div><div class="hc-strip sun" style="--n:${chartSet.length}">${strip('solarDk', 'ss', 6)}</div>`}
        </div>
      </div>
      <div class="legend">
        <span>Lowest to highest hour per day in your window (${formatHourRange(model.window.start, model.window.end)}), line = average</span>
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
            <span class="hd-price">${priceRange(s.min.price, s.max.price)} <small>kr./kWh</small></span>
          </div>
          <div class="hd-sub">
            ${badge(levelOf(s.avg), LEVEL_LABEL[levelOf(s.avg)])}
            <span class="muted">low ${formatHour(s.min.hour)} · high ${formatHour(s.max.hour)} · avg ${num(s.avg)}${mode === 'simple' || !s.best3 ? '' : ` · cheapest 3 h ${formatHourRange(s.best3.start, s.best3.end)}`}</span>
            ${mode === 'simple' ? '' : weather}
          </div>
        </summary>
        <div class="hd-detail">
          <div class="hd-chart"></div>
          <p class="muted small-print">${s.best3 ? `Cheapest 3 h ${formatHourRange(s.best3.start, s.best3.end)} at ~${num(s.best3.avg)}` : ''}${s.min.price >= 0.05 ? ` · highest is ${num(s.max.price / s.min.price, 1)}× lowest` : ''}${w && mode === 'nerd' ? ` · wind DK ${Math.round(w.windDk * 100)} % / DE ${Math.round(w.windDe * 100)} % · sun DK ${num(w.solarDk, 1)} / DE ${num(w.solarDe, 1)} kWh/m²` : ''}</p>
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

