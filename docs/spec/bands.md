# Price bands (`BAND`)

Bands answer "is this price good?" in absolute terms. They are the app's single
colour and label vocabulary, so a badge means the same thing on every tab.

The relative question, "when today?", is answered separately by the best-time
recommendation, the cheapest windows and the factor pills.

### BAND-01 · Five bands
**Status:** Implemented · **Priority:** Must · **Verify:** test

Every price MUST fall in exactly one of five bands, decided by four thresholds.

| Band | Meaning |
|---|---|
| Near free ⚡ | Below the first threshold; running anything now is nearly free |
| Cheap | Clearly below normal |
| Fair | The normal price for this area |
| Expensive | Clearly above normal |
| Extreme 🔥 | Rare peak; avoid if at all possible |

- A price exactly on a threshold belongs to the band above it.
- Negative prices are Near free.
- Five bands is the chosen resolution: three would repeat what the relative
  levels already said, and more than five is noise on a phone.

### BAND-02 · Badges
**Status:** Implemented · **Priority:** Must · **Verify:** test

A band MUST be shown as a coloured badge with its name, and the colour scale MUST
run from teal through green, yellow and orange to red.

- The current price on the day view carries the badge of its band.
- Colour is never the only signal: the name is always there too.

### BAND-03 · A day as a range of bands
**Status:** Implemented · **Priority:** Must · **Verify:** test

Where a whole day is summarised, the app MUST show the band of its lowest and its
highest hour, e.g. "Near free → Fair", collapsing to one badge when both are the
same band.

- Used in History rows, Outlook rows and the best coming day.

### BAND-04 · Editable thresholds
**Status:** Implemented · **Priority:** Must · **Verify:** test

The four thresholds MUST be editable under Settings.

- Each row shows the band, the range it covers and its upper limit.
- Thresholds must be positive and ascending; anything else is rejected and the
  previous values are kept.
- A reset button restores the suggested values.

### BAND-05 · Thresholds follow the price mode
**Status:** Implemented · **Priority:** Must · **Verify:** test

Because the full price carries roughly 0,25 kr./kWh of tariffs, tax and VAT that
the spot price does not, thresholds MUST be stored separately per price mode and
the active mode's set used everywhere.

Suggested defaults, chosen from a year of DK1 prices:

| Band | Full price | Spot price |
|---|---|---|
| Near free | < 0,50 | < 0,15 |
| Cheap | < 1,20 | < 0,60 |
| Fair | < 2,00 | < 1,10 |
| Expensive | < 3,50 | < 1,80 |
| Extreme | ≥ 3,50 | ≥ 1,80 |

With the full-price defaults about 12 % of hours land in Near free, 25 % in
Cheap, 46 % in Fair, 16 % in Expensive and 1 % in Extreme.

### BAND-06 · Where bands appear
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Bands MUST drive the colour and the wording of:

- the current price badge and the day's lowest/highest tiles,
- the hourly chart bars, whose gridlines sit at the thresholds (named in Nerd),
- the period strip and the appliance cost chips,
- History day rows and bars,
- Outlook day rows and the coming-days pills.

The cheapest window of the day MUST stay visible in the chart even when every
hour shares one band.
