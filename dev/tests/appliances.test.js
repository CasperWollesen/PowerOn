// Appliance model and cost calculations.

import { test, expect } from './harness.js';
import { addAppliance, updateAppliance, removeAppliance, costPerHour, cycleCost, cycleOptions, missingDefaults, addDefaults, unitLabel, DEFAULT_APPLIANCES } from '../../js/appliances.js';

const hours = (prices) => prices.map((price, i) => ({ hour: i, price }));

test('APPL-01', 'appliances are stored with a stable id and a clean shape', () => {
  const list = addAppliance([], { name: '  Dehumidifier ', kwh: '0.255', mode: 'hour' });
  expect(list.length).toBe(1);
  expect(list[0].name).toBe('Dehumidifier');
  expect(list[0].kwh).toBe(0.255);
  expect(list[0].durationHours).toBeNull();
  expect(list[0].id.length).toBeGreaterThan(3);
  expect(unitLabel(list[0])).toBe('kWh/h');
});

test('APPL-01', 'a cycle keeps its duration and invalid input is rejected', () => {
  const list = addAppliance([], { name: 'Wash', kwh: 0.84, mode: 'cycle', durationHours: 3.5 });
  expect(list[0].mode).toBe('cycle');
  expect(list[0].durationHours).toBe(3.5);
  expect(unitLabel(list[0])).toBe('kWh/cycle');
  expect(() => addAppliance([], { name: '', kwh: 1, mode: 'hour' })).toThrow();
  expect(() => addAppliance([], { name: 'X', kwh: 0, mode: 'hour' })).toThrow();
});

test('APPL-02', 'appliances can be edited and removed by id', () => {
  const list = addAppliance([], { name: 'Oven', kwh: 0.71, mode: 'hour' });
  const id = list[0].id;
  const edited = updateAppliance(list, id, { name: 'Oven 200 °C', kwh: 0.8 });
  expect(edited[0].id).toBe(id);
  expect(edited[0].name).toBe('Oven 200 °C');
  expect(edited[0].kwh).toBe(0.8);
  expect(removeAppliance(edited, id).length).toBe(0);
});

test('APPL-04', 'example appliances can be restored one at a time or all at once', () => {
  expect(missingDefaults([]).length).toBe(DEFAULT_APPLIANCES.length);
  const one = addDefaults([], [DEFAULT_APPLIANCES[0].name]);
  expect(one.length).toBe(1);
  expect(one[0].name).toBe(DEFAULT_APPLIANCES[0].name);
  expect(missingDefaults(one).length).toBe(DEFAULT_APPLIANCES.length - 1);
  const all = addDefaults(one, DEFAULT_APPLIANCES.map((d) => d.name));
  expect(all.length).toBe(DEFAULT_APPLIANCES.length); // no duplicates
  expect(missingDefaults(all).length).toBe(0);
});

test('APPL-05', 'hourly appliances cost consumption × price', () => {
  const dehumidifier = { name: 'Adam 20', kwh: 0.255, mode: 'hour' };
  expect(costPerHour(dehumidifier, 1.25)).toBeCloseTo(0.319, 3);
  expect(costPerHour(dehumidifier, 0)).toBe(0);
});

test('APPL-06', 'a cycle spreads its energy evenly over its duration', () => {
  const wash = { name: 'Eco 40-60', kwh: 0.84, mode: 'cycle', durationHours: 3.5 };
  const flat = hours(Array(24).fill(1));
  expect(cycleCost(wash, flat, 0)).toBeCloseTo(0.84, 6);
  // Half the cycle at 2 kr and half at 0 kr → half the energy costs 2 kr/kWh.
  const split = hours([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const twoHourWash = { ...wash, durationHours: 4 };
  expect(cycleCost(twoHourWash, split, 0)).toBeCloseTo(0.84 * 0.5 * 2, 6);
  // A cycle that does not fit in the remaining data has no cost.
  expect(cycleCost(wash, flat.slice(22), 0)).toBeNull();
});

test('APPL-06', 'the best start is the cheapest place to put the whole cycle', () => {
  const wash = { name: 'Wash', kwh: 1, mode: 'cycle', durationHours: 2 };
  const prices = hours([5, 5, 1, 1, 5, 5, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  const { best, worst } = cycleOptions(wash, prices, [0, 2, 4, 6]);
  expect(best.hour).toBe(2);
  expect(best.cost).toBeCloseTo(1, 6);
  expect(worst.cost).toBeCloseTo(5, 6);
});

test('APPL-06', 'a cycle may run past midnight into the next day', () => {
  const wash = { name: 'Wash', kwh: 2, mode: 'cycle', durationHours: 3 };
  const today = hours(Array(24).fill(4));
  const tomorrow = hours(Array(24).fill(1)).map((h) => ({ ...h }));
  const timeline = [...today, ...tomorrow];
  // Starting at 23:00 puts two of three hours in tomorrow's cheap prices.
  expect(cycleCost(wash, timeline, 23)).toBeCloseTo((2 / 3) * 4 + (2 / 3) * 1 + (2 / 3) * 1, 6);
});

test('APPL-06', 'a cycle without a duration counts as one hour', () => {
  const kettle = { name: 'Kettle', kwh: 0.2, mode: 'cycle', durationHours: null };
  expect(cycleCost(kettle, hours(Array(24).fill(3)), 5)).toBeCloseTo(0.6, 6);
});
