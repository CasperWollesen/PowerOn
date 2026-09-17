// Appliances: persistence and cost calculations.
//
// Model:
//   { id, name, kwh, mode: 'hour' | 'cycle', durationHours }
//   - mode 'hour':  kwh is consumption per hour  → cost per hour = kwh × price
//   - mode 'cycle': kwh is consumption per cycle, spread evenly over durationHours
//                   (missing/zero duration = treated as one hour)

import { load, save } from './storage.js';

const KEY = 'appliances';

export const MODES = [
  { id: 'hour', label: 'Per hour', unit: 'kWh/h' },
  { id: 'cycle', label: 'Per cycle', unit: 'kWh/cycle' },
];

// Example appliances shown on first launch so the app makes sense before the
// user adds their own. Only seeded when nothing has ever been stored; deleting
// them all leaves the list empty.
// @req APPL-03
export const DEFAULT_APPLIANCES = [
  { name: 'Eeese Adam 20 dehumidifier', kwh: 0.255, mode: 'hour' },
  { name: 'LG washing machine 30 °C', kwh: 0.3, mode: 'cycle', durationHours: 1 },
  { name: 'LG washing machine Eco 40-60', kwh: 0.84, mode: 'cycle', durationHours: 3.5 },
  { name: 'Bosch dryer', kwh: 0.39, mode: 'hour' },
  { name: 'Gorenje oven 200 °C', kwh: 0.71, mode: 'hour' },
];

// @req APPL-02 APPL-03
export function loadAppliances() {
  const stored = load(KEY, null);
  if (stored === null) {
    const seeded = DEFAULT_APPLIANCES.map((a) => sanitize({ ...a, id: newId() }));
    save(KEY, seeded);
    return seeded;
  }
  return Array.isArray(stored) ? stored.map(sanitize).filter(Boolean) : [];
}

export function saveAppliances(list) {
  save(KEY, list);
}

export function addAppliance(list, data) {
  const item = sanitize({ ...data, id: newId() });
  if (!item) throw new Error('Invalid appliance');
  return [...list, item];
}

export function updateAppliance(list, id, data) {
  return list.map((a) => (a.id === id ? sanitize({ ...a, ...data, id }) ?? a : a));
}

export function removeAppliance(list, id) {
  return list.filter((a) => a.id !== id);
}

/** Example appliances that are not in the list yet (matched by name). */
// @req APPL-04
export function missingDefaults(list) {
  const names = new Set(list.map((a) => a.name));
  return DEFAULT_APPLIANCES.filter((d) => !names.has(d.name));
}

/** Add the given example appliances (by name) that are not already present. */
export function addDefaults(list, names) {
  const wanted = new Set(names);
  const toAdd = missingDefaults(list).filter((d) => wanted.has(d.name));
  return [...list, ...toAdd.map((d) => sanitize({ ...d, id: newId() }))];
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// @req APPL-01
function sanitize(a) {
  if (!a || typeof a !== 'object') return null;
  const name = String(a.name ?? '').trim();
  const kwh = Number(a.kwh);
  if (!name || !Number.isFinite(kwh) || kwh <= 0) return null;
  const mode = a.mode === 'cycle' ? 'cycle' : 'hour';
  const duration = Number(a.durationHours);
  return {
    id: a.id || newId(),
    name,
    kwh,
    mode,
    durationHours: mode === 'cycle' && Number.isFinite(duration) && duration > 0 ? duration : null,
  };
}

export function unitLabel(appliance) {
  return MODES.find((m) => m.id === appliance.mode)?.unit ?? 'kWh';
}

/** Cost of running an hourly appliance for one hour at the given price. */
// @req APPL-05
export function costPerHour(appliance, price) {
  return appliance.kwh * price;
}

/**
 * Cost of one cycle starting at `startIndex` in `timeline` (an array of hours
 * that may span more than one day). Returns null when the cycle does not fit
 * inside the available data.
 */
// @req APPL-06
export function cycleCost(appliance, timeline, startIndex) {
  const duration = appliance.durationHours || 1;
  const slots = Math.ceil(duration);
  if (startIndex + slots > timeline.length) return null;
  let cost = 0;
  for (let k = 0; k < slots; k++) {
    const fraction = Math.min(1, duration - k); // last slot may be partial
    const energy = appliance.kwh * (fraction / duration);
    cost += energy * timeline[startIndex + k].price;
  }
  return cost;
}

/**
 * Best and worst start for a cycle appliance among the given candidate start
 * indices. The cycle may run on past the day window; only the start must be
 * inside it.
 */
export function cycleOptions(appliance, timeline, candidateIndices) {
  let best = null;
  let worst = null;
  for (const i of candidateIndices) {
    const cost = cycleCost(appliance, timeline, i);
    if (cost === null) continue;
    const option = { index: i, hour: timeline[i].hour, cost };
    if (!best || cost < best.cost) best = option;
    if (!worst || cost > worst.cost) worst = option;
  }
  return { best, worst };
}
