# Data sources

Personal usage is optionally fetched from the Eloverblik Customer API through a
private Cloudflare Worker. See [architecture and setup](eloverblik-setup.md) and
[decision 0009](decisions/0009-private-usage-worker.md). No Eloverblik token or
meter identity is included in public browser requests or committed configuration.

Public price and weather sources are called directly from the browser and must send
permissive CORS headers. Findings below were verified on the dates given.

## Spot prices — elprisenligenu.dk

```
GET https://www.elprisenligenu.dk/api/v1/prices/2026/09-17_DK1.json
```

- Response: array of 24 hours (23 or 25 on daylight-saving days):
  `{ DKK_per_kWh, EUR_per_kWh, EXR, time_start, time_end }` with Danish offsets.
- `access-control-allow-origin: *` (verified 2026-09-10).
- Tomorrow appears when Nord Pool publishes, typically around 13:00; before that
  the file returns **404**.
- History goes back to at least November 2022.
- Prices are the hourly average of the 15-minute market prices, excl. everything else.

## Tariffs and taxes — stromligning.dk

```
GET https://stromligning.dk/api/Prices?priceArea=DK1&supplierId=n1_c
    &from=2026-09-17T00:00:00&to=2026-09-17T23:45:00
GET https://stromligning.dk/api/suppliers
```

- 15-minute points with `details`: `electricity`, `transmission.systemTariff`,
  `transmission.netTariff`, `electricityTax`, `distribution` (the grid company's
  time-of-use tariff) and `surcharge`, each with value, VAT and total.
- `access-control-allow-origin: *` (verified 2026-09-17).
- Days without published prices return an empty `prices` array.
- `suppliers` lists grid companies with `id`, `name`, `priceArea`, customer groups.
- 2026 national values: system tariff 0,072 · net tariff 0,043 · electricity tax
  0,008 kr./kWh excl. VAT. The electricity tax is at the EU minimum in 2026.
- Grid tariffs are seasonal and peak 17–21; N1 winter peak reached 0,78 kr./kWh in
  October 2025 versus 0,34 in September 2026.

## Weather — Open-Meteo

```
GET https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…
    &hourly=wind_speed_100m&wind_speed_unit=ms&past_days=92&forecast_days=8
    &timezone=Europe%2FCopenhagen
GET https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…
    &daily=shortwave_radiation_sum,temperature_2m_mean&past_days=92&forecast_days=8
```

- `access-control-allow-origin: *`. No API key for non-commercial use.
- Several locations in one request; the response is then an array in the same order.
- `past_days` is capped at 92, and 100 m wind is missing for roughly the oldest
  20 of those days, so about 70 past days are usable for training.
- `shortwave_radiation_sum` is MJ/m² per day; divide by 3,6 for kWh/m².
- Locations: wind at Horns Rev, Ringkøbing, Thy, Anholt (DK) and the German North
  Sea, Schleswig-Holstein, Lower Saxony, Brandenburg (DE); sun and temperature at
  central Jutland, central Germany and Bavaria.
- Compressed payload for the wind request is about 75 KB; it is fetched at most
  every 3 hours.

## Rejected: Energinet Energi Data Service

```
GET https://api.energidataservice.dk/dataset/DayAheadPrices?...
```

- Returns data with `access-control-allow-origin: *` when there is **no** `Origin`
  header, but an empty 200 with no CORS headers for any origin except
  `energidataservice.dk` and `www.energidataservice.dk` (verified 2026-09-10 for
  both `DayAheadPrices` and the legacy `Elspotprices`).
- Therefore unusable from GitHub Pages without a proxy. See
  [decisions/0002-spot-price-source.md](decisions/0002-spot-price-source.md).
- Its current dataset is 15-minute resolution, which would need aggregating.

## Ground truth for manual checks

- stromligning.dk's own total for a grid company is the reference for the full
  price; elpriser.dk embeds it and shows the **15-minute** price, which differs
  from our hourly average.
- Energinet's 15-minute prices average exactly to elprisenligenu.dk's hourly price
  (checked for 10 September 2026).
