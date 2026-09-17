# Pricing (`PRICE`)

What a kWh costs the household, and where each part comes from.

### PRICE-01 · Full price formula
**Status:** Implemented · **Priority:** Must · **Verify:** test

In full-price mode (the default) the price for an hour MUST be

```
(spot + Energinet system tariff + Energinet net tariff + electricity tax
 + grid company tariff + supplier surcharge) × 1.25
```

- Verified example, DK1 17 September 2026 16:00 with grid company N1 C:
  `(0,5426 + 0,072 + 0,043 + 0,008 + 0,131782) × 1,25 = 0,997 kr./kWh`,
  matching stromligning.dk's own total.
- Negative spot prices stay negative and still carry tariffs and tax.

### PRICE-02 · Spot-only mode
**Status:** Implemented · **Priority:** Should · **Verify:** test

The user MUST be able to see the raw market price instead.

- Spot mode shows the spot price excl. VAT, with all tariff parts at zero.
- The footer says which mode is active.

### PRICE-03 · Tariff data
**Status:** Implemented · **Priority:** Must · **Verify:** review

Tariffs MUST be fetched per day and grid company from stromligning.dk.

- 15-minute values are averaged per Danish local hour.
- Fetched for today and tomorrow whenever full-price mode is active.
- Cached per area, grid company and date.
- A day without published prices returns no tariffs and is not an error.

### PRICE-04 · Tariff fallback
**Status:** Implemented · **Priority:** Must · **Verify:** test

For days without their own tariff data the app MUST fall back in this order:

1. The exact day, if cached.
2. The nearest cached day for the same grid company (used for history and outlook).
3. National defaults for 2026: system 0,072 + net 0,043 + electricity tax 0,008
   kr./kWh excl. VAT, grid tariff 0.

- The Nerd view states which of the three was used.

### PRICE-05 · Grid company
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The user MUST be able to pick their grid company so the local tariff is included.

- The list comes from stromligning.dk, filtered by price area, sorted with Danish
  collation, cached for a week, discontinued companies removed.
- "Not selected" means national tariffs only.
- Changing the price area clears the choice.

### PRICE-06 · Supplier surcharge
**Status:** Implemented · **Priority:** Should · **Verify:** test

The user MUST be able to enter their supplier's markup per kWh (excl. VAT); it is
added before VAT in full-price mode. Default 0.

### PRICE-07 · Price breakdown
**Status:** Implemented · **Priority:** Should · **Verify:** test

Every priced hour MUST carry its parts (spot, system, net, tax, grid, surcharge,
VAT) so the Nerd view can show where the money goes; the parts sum to the total.

### PRICE-08 · Telling the user what they see
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The app MUST state the active price model.

- The footer shows area, model and grid company, e.g.
  "DK1 · incl. tariffs, tax & VAT (N1 C) · window 06–22".
- In full-price mode without a grid company, a dismissible banner offers to pick one.
