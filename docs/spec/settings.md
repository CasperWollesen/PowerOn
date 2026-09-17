# Settings (`SET`)

### SET-01 · Page
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Settings MUST be one page reached from the gear icon, at the route `#settings`,
with a back button, grouped as: Appliances, Prices, Appearance, Install, About.

### SET-02 · Persistence and validation
**Status:** Implemented · **Priority:** Must · **Verify:** test

All settings MUST be stored on the device and validated on load.

- Unknown or invalid values fall back to the default instead of breaking the app.
- Settings from older versions are migrated (`extraPerKwh` became
  `supplierSurcharge`; the VAT switch became the price mode).

### SET-03 · Defaults
**Status:** Implemented · **Priority:** Must · **Verify:** test

| Setting | Default |
|---|---|
| Theme | System |
| Chart maximum | 10 kr./kWh |
| Day starts | 06:00 |
| Day ends | 22:00 |
| Price area | DK1 |
| Price shown | Full price |
| Grid company | Not selected |
| Supplier surcharge | 0 kr./kWh |
| View mode | Full |
| Price bands, full price | 0,50 · 1,20 · 2,00 · 3,50 kr./kWh |
| Price bands, spot price | 0,15 · 0,60 · 1,10 · 1,80 kr./kWh |

### SET-04 · Theme
**Status:** Implemented · **Priority:** Should · **Verify:** manual

System, Light and Dark. System follows the operating system live, and the browser
UI colour follows the theme.

### SET-05 · Price area
**Status:** Implemented · **Priority:** Must · **Verify:** manual

DK1 and DK2 MUST both work. Changing the area clears the grid company and reloads
prices, tariffs and the outlook.

### SET-06 · Chart maximum
**Status:** Implemented · **Priority:** Must · **Verify:** manual

The user MUST be able to set the fixed Y axis maximum (> 0). It never changes by itself.

### SET-07 · Day window
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Start and end of the day window are user settable and drive every recommendation,
including the outlook, which is recalculated when they change.

### SET-08 · Install and About
**Status:** Implemented · **Priority:** Should · **Verify:** manual

Settings MUST explain how to install the app on the current platform and name the
data sources and the version.

### SET-09 · Price bands
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Settings MUST let the user edit the four band thresholds for the active price
mode, with a reset to the suggested values. See [bands.md](bands.md).
