// Battery strategies and the optimiser. Pure (LAB-01).
//
// A strategy decides, hour by hour, how much the stored energy changes (dE, kWh on
// the battery side; positive = charging). hourFlows() turns that decision into
// energy flows and money, so every strategy is priced by the same rules.

import { addDays } from '../js/time.js';

export const STRATEGIES = Object.freeze(['nothing', 'none', 'self', 'threshold', 'manual', 'smartSolar', 'smartGrid']);

const EPS = 1e-9;

/** Battery, grid and strategy settings as plain numbers for one simulation. */
// @req LAB-05
export function batteryConfig(settings) {
  const b = settings.battery;
  const s = settings.strategy;
  const eMin = (b.capacityKwh * b.minSocPct) / 100;
  const eMax = (b.capacityKwh * Math.max(b.maxSocPct, b.minSocPct)) / 100;
  return {
    capacity: b.capacityKwh,
    eMin,
    eMax,
    eStart: Math.min(eMax, Math.max(eMin, (b.capacityKwh * b.startSocPct) / 100)),
    etaC: b.chargeEff / 100,
    etaD: b.dischargeEff / 100,
    pc: b.chargeKw,
    pd: b.dischargeKw,
    exportKw: settings.grid.exportKw,
    importKw: settings.grid.importKw,
    wear: s.wear,
    margin: s.gridMargin,
    threshold: s.sellThreshold,
    manualBuyBelow: s.manualBuyBelow,
    manualSellHours: s.manualSellHours,
    manualSellFloor: s.manualSellFloor,
    step: s.stepKwh,
    curtail: s.curtail,
    planner: s.planner,
  };
}

/**
 * Energy flows and money for one hour, given the change in stored energy dE.
 * Solar covers the house first, then charges the battery, then is exported; the
 * battery covers the house before it exports. Returns null when the decision
 * breaks a grid limit.
 */
// @req LAB-05 LAB-08
export function hourFlows(pv, load, buy, sell, dE, cfg) {
  const cin = dE > 0 ? dE / cfg.etaC : 0;
  const dout = dE < 0 ? -dE * cfg.etaD : 0;
  const pvToLoad = Math.min(pv, load);
  let surplus = pv - pvToLoad;
  const deficit = load - pvToLoad;
  const pvToBat = Math.min(cin, surplus);
  surplus -= pvToBat;
  const gridToBat = cin - pvToBat;
  const batToLoad = Math.min(dout, deficit);
  const batToGrid = dout - batToLoad;
  const gridToLoad = deficit - batToLoad;

  let pvToGrid = surplus;
  let curtailed = 0;
  if (sell < 0 && cfg.curtail) {
    curtailed = pvToGrid;
    pvToGrid = 0;
  }
  if (pvToGrid + batToGrid > cfg.exportKw) {
    const cut = Math.min(pvToGrid, pvToGrid + batToGrid - cfg.exportKw);
    pvToGrid -= cut;
    curtailed += cut;
  }
  if (batToGrid > cfg.exportKw + EPS) return null;
  const importKwh = gridToLoad + gridToBat;
  if (gridToBat > EPS && importKwh > cfg.importKw + EPS) return null;
  const exportKwh = pvToGrid + batToGrid;
  return {
    dE, cin, dout, pvToLoad, pvToBat, pvToGrid, gridToLoad, gridToBat, batToLoad, batToGrid,
    curtailed, importKwh, exportKwh,
    cost: importKwh * buy,
    revenue: exportKwh * sell,
    wear: dout * cfg.wear,
  };
}

/** What the optimiser minimises for one hour; Infinity when the move is not allowed. */
function moveCost(pv, load, buy, sell, dE, cfg, gridLimit) {
  const f = hourFlows(pv, load, buy, sell, dE, cfg);
  if (!f) return Infinity;
  if (f.gridToBat > EPS && buy > gridLimit) return Infinity;
  return f.cost - f.revenue + f.wear + f.gridToBat * cfg.margin;
}

/** Grid charging as a price limit: false = never, true = whenever it pays, a number = at or below it. */
function gridLimitOf(gridCharging) {
  if (gridCharging === true) return Infinity;
  if (gridCharging === false) return -Infinity;
  return gridCharging;
}

/**
 * Dynamic programming over battery levels for hours [i0, i1). Returns the stored
 * energy at every hour boundary (length i1 − i0 + 1).
 *
 * Levels are eMin + k × step and the plan starts at the level nearest e0. With
 * `anchored`, the levels are laid out from e0 itself, and with `endEnergy` the plan
 * must end exactly there (the step is stretched slightly so both ends are levels);
 * it then returns null when that end cannot be reached.
 */
// @req LAB-07
export function planWindow(inp, i0, i1, e0, cfg, gridCharging, { anchored = false, endEnergy = null } = {}) {
  const gridLimit = gridLimitOf(gridCharging);
  let step = cfg.step;
  let lo = cfg.eMin;
  if (anchored) {
    const moves = endEnergy === null ? 0 : Math.round((endEnergy - e0) / step);
    if (moves !== 0) step = Math.abs((endEnergy - e0) / moves);
    lo = e0 - Math.floor((e0 - cfg.eMin) / step + EPS) * step;
  }
  const K = Math.floor((cfg.eMax - lo) / step + EPS) + 1;
  const up = Math.floor((cfg.pc * cfg.etaC) / step + EPS);
  const down = Math.floor(cfg.pd / cfg.etaD / step + EPS);
  const n = i1 - i0;
  const choice = new Int32Array(n * K);
  const costs = new Float64Array(up + down + 1);
  let next = new Float64Array(K);
  let cur = new Float64Array(K);

  let minBuy = Infinity;
  for (let i = i0; i < i1; i++) if (inp.priced[i] && inp.buy[i] < minBuy) minBuy = inp.buy[i];
  const leftValue = Number.isFinite(minBuy) ? Math.max(0, cfg.etaD * (minBuy - cfg.wear)) : 0;
  const kEnd = endEnergy === null ? -1 : Math.round((endEnergy - lo) / step);
  for (let k = 0; k < K; k++) {
    if (kEnd >= 0 && kEnd < K) next[k] = k === kEnd ? 0 : Infinity;
    else next[k] = -leftValue * k * step;
  }

  for (let s = n - 1; s >= 0; s--) {
    const i = i0 + s;
    const row = s * K;
    if (!inp.priced[i]) {
      for (let k = 0; k < K; k++) {
        cur[k] = next[k];
        choice[row + k] = k;
      }
    } else {
      for (let d = -down; d <= up; d++) {
        costs[d + down] = moveCost(inp.pv[i], inp.load[i], inp.buy[i], inp.sell[i], d * step, cfg, gridLimit);
      }
      for (let k = 0; k < K; k++) {
        // Staying put wins ties, so the plan never cycles for nothing.
        let best = costs[down] + next[k];
        let bestK = k;
        const lo = Math.max(0, k - down);
        const hi = Math.min(K - 1, k + up);
        for (let k2 = lo; k2 <= hi; k2++) {
          const c = costs[k2 - k + down] + next[k2];
          if (c < best - EPS) {
            best = c;
            bestK = k2;
          }
        }
        cur[k] = best;
        choice[row + k] = bestK;
      }
    }
    [next, cur] = [cur, next];
  }

  let k = Math.min(K - 1, Math.max(0, Math.round((e0 - lo) / step)));
  if (!Number.isFinite(next[k])) return null;
  const energy = new Float64Array(n + 1);
  energy[0] = lo + k * step;
  for (let s = 0; s < n; s++) {
    k = choice[s * K + k];
    energy[s + 1] = lo + k * step;
  }
  return energy;
}

/**
 * Stored energy at every hour boundary for an optimised strategy.
 * Day-ahead: plan at 13:00 for the hours until tomorrow midnight, carry out 24 h.
 * Hindsight: one plan over the whole period. gridCharging as in planWindow.
 */
// @req LAB-07
export function planPeriod(inp, cfg, gridCharging) {
  const n = inp.hours.length;
  if (cfg.planner === 'hindsight') return planWindow(inp, 0, n, cfg.eStart, cfg, gridCharging);
  const energy = new Float64Array(n + 1);
  const dayStart = new Map();
  const planHours = [];
  inp.hours.forEach((h, i) => {
    if (!dayStart.has(h.date)) dayStart.set(h.date, i);
    if (h.hour === 13 && (i === 0 || inp.hours[i - 1].hour !== 13)) planHours.push(i);
  });
  let e = cfg.eStart;
  let i = 0;
  let p = 0;
  energy[0] = startEnergy(cfg, 'smartGrid');
  while (i < n) {
    const { date, hour } = inp.hours[i];
    const horizon = dayStart.get(addDays(date, hour >= 13 ? 2 : 1)) ?? n;
    while (p < planHours.length && planHours[p] <= i) p++;
    const commit = Math.min(planHours[p] ?? n, horizon);
    const plan = planWindow(inp, i, horizon, e, cfg, gridCharging);
    for (let s = 1; s <= commit - i; s++) energy[i + s] = plan[s];
    e = energy[commit];
    i = commit;
  }
  return energy;
}

/**
 * The hours in which "Today (manual)" sells: each day's `manualSellHours` best sell
 * prices, if they are at least `manualSellFloor`. Today's prices are known since
 * yesterday 13:00, so a person can pick them.
 */
export function manualSellHours(inp, cfg) {
  const mask = new Uint8Array(inp.hours.length);
  const days = new Map();
  inp.hours.forEach((h, i) => {
    if (!inp.priced[i]) return;
    if (!days.has(h.date)) days.set(h.date, []);
    days.get(h.date).push(i);
  });
  for (const list of days.values()) {
    list.sort((a, b) => inp.sell[b] - inp.sell[a] || a - b);
    for (const i of list.slice(0, cfg.manualSellHours)) if (inp.sell[i] >= cfg.manualSellFloor) mask[i] = 1;
  }
  return mask;
}

/**
 * dE per hour for the rule-based strategies. Every rule stores solar surplus and
 * covers the house; on top of that:
 *   threshold – sells at full power when the sell price is at or above the threshold;
 *   manual    – sells at full power in the day's best hours (manualSellHours) and
 *               fills up from the grid when the full buy price is nearly free.
 */
// @req LAB-06
export function ruleDeltas(inp, cfg, rule = 'self') {
  const n = inp.hours.length;
  const deltas = new Float64Array(n);
  const sellNow = rule === 'manual' ? manualSellHours(inp, cfg) : null;
  let e = cfg.eStart;
  for (let i = 0; i < n; i++) {
    if (!inp.priced[i]) continue;
    const surplus = inp.pv[i] - inp.load[i];
    const sells = rule === 'threshold' ? inp.sell[i] >= cfg.threshold : rule === 'manual' && sellNow[i] === 1;
    let dE;
    if (rule === 'manual' && inp.buy[i] <= cfg.manualBuyBelow) {
      const headroom = Math.max(0, cfg.importKw - Math.max(0, -surplus)) + Math.max(0, surplus);
      dE = Math.max(0, Math.min(cfg.pc, headroom, (cfg.eMax - e) / cfg.etaC)) * cfg.etaC;
    } else if (sells) {
      const dout = Math.min(cfg.pd, (e - cfg.eMin) * cfg.etaD, Math.max(0, -surplus) + cfg.exportKw);
      dE = -dout / cfg.etaD;
    } else if (surplus > 0) {
      dE = Math.min(surplus, cfg.pc, (cfg.eMax - e) / cfg.etaC) * cfg.etaC;
    } else {
      dE = -Math.min(-surplus, cfg.pd, (e - cfg.eMin) * cfg.etaD) / cfg.etaD;
    }
    if (Math.abs(dE) < EPS) dE = 0;
    deltas[i] = dE;
    e += dE;
  }
  return deltas;
}

/**
 * Run one strategy over the period. Returns per-hour rows with flows, money, stored
 * energy after the hour and its origin (solar / grid / start).
 */
// @req LAB-06 LAB-08
export function runStrategy(inp, cfg, strategy) {
  const n = inp.hours.length;
  if (strategy === 'nothing') inp = { ...inp, pv: new Float64Array(n) };
  let deltas;
  if (strategy === 'none' || strategy === 'nothing') {
    deltas = new Float64Array(n);
  } else if (strategy === 'self' || strategy === 'threshold' || strategy === 'manual') {
    deltas = ruleDeltas(inp, cfg, strategy);
  } else {
    const energy = planPeriod(inp, cfg, strategy === 'smartGrid');
    deltas = new Float64Array(n);
    for (let i = 0; i < n; i++) deltas[i] = energy[i + 1] - energy[i];
  }

  const rows = new Array(n);
  buildRows(inp, cfg, deltas, 0, n, { solarE: 0, gridE: 0, startE: startEnergy(cfg, strategy) }, rows);
  return { strategy, rows };
}

/**
 * Rows for hours [from, to) from the energy change per hour, starting with the
 * battery content split into solar, grid and start energy. Writes into `rows`.
 */
// @req LAB-08
function buildRows(inp, cfg, deltas, from, to, pools, rows) {
  let { solarE, gridE, startE } = pools;
  for (let i = from; i < to; i++) {
    const dE = deltas[i];
    const f = hourFlows(inp.pv[i], inp.load[i], inp.buy[i], inp.sell[i], dE, { ...cfg, exportKw: cfg.exportKw + 1e-6, importKw: Infinity });
    let soldSolar = 0;
    let soldGrid = 0;
    if (dE > 0) {
      solarE += f.pvToBat * cfg.etaC;
      gridE += f.gridToBat * cfg.etaC;
    } else if (dE < 0) {
      const total = solarE + gridE + startE;
      const take = total > EPS ? Math.min(1, -dE / total) : 0;
      const soldShare = f.dout > EPS ? f.batToGrid / f.dout : 0;
      soldSolar = solarE * take * cfg.etaD * soldShare;
      soldGrid = gridE * take * cfg.etaD * soldShare;
      solarE -= solarE * take;
      gridE -= gridE * take;
      startE -= startE * take;
    }
    rows[i] = {
      ...f,
      priced: inp.priced[i] === 1,
      pv: inp.pv[i],
      load: inp.load[i],
      buy: inp.buy[i],
      sell: inp.sell[i],
      energy: solarE + gridE + startE,
      solarE,
      gridE,
      startE,
      soldSolar,
      soldGrid,
      soldRevenue: f.batToGrid * inp.sell[i],
    };
  }
}

/**
 * Smart control replayed one day at a time against "Today (manual)": every day
 * starts and ends with the battery exactly where today's way had it, so the
 * difference is what better decisions earn that day, and days add up.
 * gridCharging as in planWindow. A day where the plan is not cheaper than
 * `fallbackRows` (the optimiser moves in whole steps) keeps the fallback's hours:
 * smart control can always do what the simpler way did. Returns rows aligned with the hours.
 */
// @req LAB-07 LAB-18
export function runDays(inp, cfg, manualRows, gridCharging, fallbackRows = manualRows) {
  const n = inp.hours.length;
  const deltas = new Float64Array(n);
  const rows = new Array(n);
  const start = startEnergy(cfg, 'manual');
  const dayCost = (list, from, to) => {
    let sum = 0;
    for (let i = from; i < to; i++) if (list[i].priced) sum += list[i].cost - list[i].revenue + list[i].wear;
    return sum;
  };
  let from = 0;
  while (from < n) {
    let to = from + 1;
    while (to < n && inp.hours[to].date === inp.hours[from].date) to++;
    const before = from > 0 ? manualRows[from - 1] : { energy: start, solarE: 0, gridE: 0, startE: start };
    const e0 = before.energy;
    const e1 = manualRows[to - 1].energy;
    // In whole steps the exact end level is sometimes out of reach; then the day keeps the fallback.
    const plan = planWindow(inp, from, to, e0, cfg, gridCharging, { anchored: true, endEnergy: e1 });
    if (plan) {
      let e = e0;
      for (let s = 1; s <= to - from; s++) {
        deltas[from + s - 1] = plan[s] - e;
        e = plan[s];
      }
      buildRows(inp, cfg, deltas, from, to, before, rows);
    }
    if (!plan || dayCost(rows, from, to) > dayCost(fallbackRows, from, to) - EPS) {
      for (let i = from; i < to; i++) rows[i] = fallbackRows[i];
    }
    from = to;
  }
  return rows;
}

/** Stored energy at the period start: none without a battery, snapped to the optimiser's grid when planned. */
export function startEnergy(cfg, strategy) {
  if (strategy === 'none' || strategy === 'nothing') return 0;
  if (strategy === 'self' || strategy === 'threshold' || strategy === 'manual') return cfg.eStart;
  return cfg.eMin + Math.round((cfg.eStart - cfg.eMin) / cfg.step) * cfg.step;
}

/**
 * What the battery mainly did in an hour, for labels and the hourly table. A small
 * export next to a larger house cover (the optimiser moves in whole steps) is a cover.
 */
export function hourAction(row) {
  const min = 0.05;
  if (row.batToGrid > min && row.batToGrid >= row.batToLoad) return 'sell';
  if (row.gridToBat > min) return 'buy';
  if (row.pvToBat > min) return 'store';
  if (row.batToLoad > min) return 'cover';
  return 'idle';
}
