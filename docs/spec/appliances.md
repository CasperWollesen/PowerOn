# Appliances (`APPL`)

### APPL-01 · Model
**Status:** Implemented · **Priority:** Must · **Verify:** test

An appliance MUST be `{ id, name, kwh, mode, durationHours }`.

- `mode` is `hour` (kWh per hour) or `cycle` (kWh per run).
- `durationHours` applies to cycles only and may be empty.
- Consumption is always kWh, never watts.
- Entries without a name or with consumption ≤ 0 are rejected.

### APPL-02 · Manage
**Status:** Implemented · **Priority:** Must · **Verify:** test

Appliances MUST be added, edited and removed under Settings, stored on the device.

- Editing keeps the id, so costs and order stay stable.
- Removing asks for confirmation.

### APPL-03 · Examples on first launch
**Status:** Implemented · **Priority:** Should · **Verify:** review

On the very first launch the app MUST seed a set of example appliances so a new
user immediately sees what it does. A list the user has emptied stays empty.

### APPL-04 · Restore examples
**Status:** Implemented · **Priority:** Should · **Verify:** test

Settings MUST offer the missing examples, individually or all at once, matched by
name so nothing is duplicated.

### APPL-05 · Hourly cost
**Status:** Implemented · **Priority:** Must · **Verify:** test

For `hour` appliances the cost is consumption × price for that hour.

### APPL-06 · Cycle cost
**Status:** Implemented · **Priority:** Must · **Verify:** test

For `cycle` appliances the energy MUST be spread evenly over the duration from the
chosen start hour.

- A cycle of 3,5 h occupies 4 hours, the last one counting half.
- A cycle may start in the day window and run past it, including past midnight
  into tomorrow's prices when those are known.
- Without a duration the cycle counts as one hour.
- A cycle that does not fit in the available prices is not priced.

### APPL-07 · Costs in Full and Nerd
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Each appliance MUST show what it costs now and in each price period.

- Hourly appliances: a "Now" chip with the factor against the cheapest hour, plus
  one chip per price band with its hours and cost, and the factor against the
  cheapest band.
- Cycles: "Start now", "Best start" and "Worst start" with times, costs and the
  factor against the best start.

### APPL-08 · Costs in Simple
**Status:** Implemented · **Priority:** Should · **Verify:** manual

Simple MUST fit each appliance on one line: now, best and worst, with times and
factors, marking when now already is the cheapest.

### APPL-09 · Collapsible
**Status:** Implemented · **Priority:** Could · **Verify:** manual

The appliance section MUST be collapsible and remember its state on the device.
