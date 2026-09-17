# Product

## Purpose

PowerOn answers one question on a phone in a few seconds:

> **When should I use power — and what does it cost me to run this appliance now
> instead of later?**

It is a personal tool for a household in Denmark's DK1 area with a spot-price
electricity contract and a handful of flexible loads: washing machine, dryer,
dishwasher, dehumidifier, oven.

## Principles

1. **Answer, then detail.** The first screen states what to do. Numbers that only
   satisfy curiosity live under the Nerd view.
2. **Contrast over precision.** Whether an hour costs 0,33 or 0,50 kr. matters
   less than knowing the evening costs 3 kr. Lowest, highest, bands and factors
   carry the message; averages are secondary.
3. **One vocabulary.** A price band means the same thing on every tab and every
   day, so "Fair" never has to be re-learned.
4. **Honest numbers.** Show the price the household actually pays, including
   tariffs, tax and VAT, and say which parts are estimated.
5. **Comparable pictures.** The chart's Y axis never rescales itself, so two days
   can be compared by eye.
6. **No invented data.** Real prices for today and tomorrow. The outlook for
   later days is clearly an estimate, with its own uncertainty and accuracy shown.
7. **Private and offline-friendly.** Everything is stored on the device; no
   account, no server, no analytics.

## Non-goals

- No backend, login, sync between devices or push notifications.
- No automation or control of appliances.
- No trading advice, supplier comparison or contract switching.
- No hourly forecast beyond the published day-ahead prices; the outlook is per day.

## Users

One primary user (the household), possibly shared with family members on their
own phones. No roles, no permissions.

## Glossary

| Term | Meaning |
|---|---|
| **Spot price** | Nord Pool day-ahead price, kr./kWh excl. tariffs, tax and VAT |
| **Full price** | What the household pays: spot + tariffs + tax + surcharge, incl. VAT |
| **Grid company** | Netselskab; owns the local grid and charges a time-of-use tariff |
| **Day window** | The hours the user cares about, default 06:00–22:00 |
| **Actionable hours** | Hours in the day window that have not passed yet |
| **Band** | Near free / Cheap / Fair / Expensive / Extreme, by absolute price |
| **Factor** | How many times one price is of another, e.g. "2,4× cheapest" |
| **Outlook** | Estimated price level for days beyond the published prices |
| **Cycle** | An appliance run with a fixed energy use and duration, e.g. a wash |
