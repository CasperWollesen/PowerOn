# Connect Usage History: Eloverblik + Cloudflare

PowerOn's public price tabs work as before. Usage History needs your own private
Worker: a small program hosted by Cloudflare that keeps your Eloverblik token
away from the public website. No build step, npm, database or custom domain is
required. You create the Cloudflare account yourself with your preferred email;
account email addresses and credentials must never be added to this repository.

## What goes where

```text
GitHub Pages (public code)
  Usage History → HTTPS + private app key → Cloudflare Worker
                                               │ secrets
                                               └→ Eloverblik Customer API
  Published spot prices + existing tariff model ← public price APIs
  Shared price bands ← existing PowerOn settings
```

The Worker returns only interval start/end, kWh, estimated flag and fetch time.
It does not return meter IDs, addresses, tokens or raw upstream errors. Public
price data remains in the existing local cache. Personal readings and the app
key live only in the open page's memory, and disappear on disconnect or reload.
Only the non-secret Worker origin is saved as `poweron.ui.usageWorkerUrl`.

## 1. Get access to your own Eloverblik data

1. Sign in to [Eloverblik](https://eloverblik.dk/) using the normal login.
2. Under API access, create a **Customer API refresh token** for your own data.
   Keep it in your password manager. Do not paste it into chat, an issue, source
   code, a screenshot or a commit.
3. Find the 18-digit metering point ID for **electricity consumption**. Ensure it
   belongs to a meter you can access. Do not choose a production/export meter.
4. You will enter both values directly into Cloudflare secrets in step 3.

Eloverblik exchanges the refresh token for a data access token. The Worker uses
`GET /customerapi/api/token` and then
`POST /customerapi/api/meterdata/gettimeseries/{from}/{to}/Actual` with
`{"meteringPoints":{"meteringPoint":["<configured meter>"]}}`.
The end date is exclusive: the UI's inclusive end is advanced by one Danish
calendar day. Actual 15-minute or hourly readings are supported. Daily/profiled
resolutions cannot safely be assigned to price bands and are rejected.

## 2. Create the Cloudflare Worker

1. Create/sign in to your [Cloudflare account](https://dash.cloudflare.com/).
2. Open **Workers & Pages**, choose **Create application**, then create a Worker
   (the Hello World/start-from-code option is sufficient).
3. Choose a name such as `poweron-usage`. The default `workers.dev` address is
   enough; buying a domain is unnecessary.
4. Open **Edit code**. Replace the starter module with the complete contents of
   [`worker/worker.js`](../worker/worker.js). Deploy it.
5. An unconfigured Worker refuses data requests. Configure it below before use.

The dashboard can change its menu wording; look for the Worker's code editor and
Settings → Variables and Secrets. This deployment is separate from GitHub Pages:
future changes to `worker/worker.js` must also be deployed to Cloudflare.

## 3. Configure variables and secrets

In the Worker's **Settings → Variables and Secrets**, add:

| Name | Type | Value |
|---|---|---|
| `ALLOWED_ORIGIN` | Plain text | `https://casperwollesen.github.io` (origin only, no `/PowerOn/`, no trailing slash) |
| `ELOVERBLIK_REFRESH_TOKEN` | Secret | Your Customer API refresh token |
| `ELOVERBLIK_METERING_POINT` | Secret | Your 18-digit consumption meter ID |
| `POWERON_APP_KEY` | Secret | A new, separate, cryptographically random private key |

Generate the app key with your password manager: at least **32 random bytes**
(64 hexadecimal characters, or a 43+ character base64url representation). Do not
use a phrase or reuse the Eloverblik token. Save the app key in your password
manager so you can enter it on your phone. The Worker enforces a minimum length;
you are responsible for generating a random value.

Save/deploy the variables. Never put their values in this repository, Cloudflare
plaintext variables, build variables, git commands or public Worker source.
`ALLOWED_ORIGIN` is intentionally non-secret. Secrets are encrypted bindings.

No Cloudflare API key is needed for the dashboard workflow. This version uses
the separate app key for authentication, so Cloudflare Access is not required.
Do not add a cookie-based Access login in front of `/usage` without adapting the
frontend authentication flow.

## 4. Connect PowerOn

1. Open PowerOn → **Usage History**.
2. Enter your HTTPS Worker origin, for example
   `https://poweron-usage.<your-subdomain>.workers.dev` (no `/usage` path).
3. Enter **POWERON_APP_KEY**, not the Eloverblik refresh token.
4. Choose **Connect privately**. The default selection is the last 30 completed
   Danish days. Choose 7, 30, 90 days, or a custom inclusive period up to 92 days.
5. Match one completed day's total with Eloverblik. Verify the selected price
   area, grid company and supplier surcharge in PowerOn Settings.
6. Disconnect when finished. Reloading also clears the key and readings.

The browser stores no private usage history for offline access. Do not use the
connection on an untrusted shared browser. Anyone with the app key can request
consumption; CORS is an additional browser restriction, not authentication.

## How the analysis works

- All intervals use absolute timestamps. Danish period boundaries include the
  correct 23/25-hour daylight-saving days; repeated hours remain distinct.
- The existing `priceHours()` model and configurable `bandEdges()` / `bandFor()`
  determine prices and bands. Usage includes all hours, not just the day window.
- kWh is multiplied by the matching interval's price. If an hourly reading spans
  multiple price intervals, it is split proportionally, assuming uniform use.
- Shares are percentages of **all reported kWh**, including unpriced readings.
  Missing prices appear as unpriced kWh and are excluded from costs. Missing
  readings reduce time coverage; they are never invented or replaced with zero.
- Expensive and Extreme consumption is prominent; a combined share of 20% or
  more is marked significant. This is a visual threshold, not a forecast of
  achievable savings.
- Meter quality A03/A01 and profiled consumption are labelled estimated. Missing
  A02 and incomplete A05 readings are excluded and reduce coverage.
- Full-price costs are estimates using the app's hourly tariff model and current
  supplier settings. Historical tariff gaps use the existing nearest/default
  fallback, explicitly disclosed. Subscriptions are excluded. Spot mode excludes
  all add-ons and VAT. This is not invoice reconciliation.
- Base consumption needs at least seven complete measured days (167 hours covers
  a spring DST week), with no gaps or estimated readings. The duration-weighted
  10th percentile of kW is applied to the observed period, capped per reading.
  Solar, heating and flexible appliances can distort it; it is not measured standby.

## Troubleshooting and operation

### Update an existing Worker for precise error messages

GitHub Pages updates automatically; the Worker does not. If PowerOn reports
`Worker HTTP 502` and asks for an update, open your Worker in Cloudflare →
**Edit code**, replace the module with the latest
[`worker/worker.js`](../worker/worker.js), and choose **Deploy**. Keep all existing
variables and secrets. Reload PowerOn, re-enter the app key and retry.

Safe codes in square brackets identify the failing step:

- `TOKEN_REJECTED`: Eloverblik rejected token exchange; check the active Customer
  API refresh token, not the separate PowerOn app key.
- `METER_REJECTED`: readings were refused; a recognized numeric Eloverblik code
  explains missing meter access or dates outside your authorization.
- `TOKEN_NETWORK` / `READINGS_NETWORK`: the Worker could not reach the indicated
  upstream endpoint, including timeout; retry later.
- `DATA_*`: data arrived but failed validation. Share only the code shown in
  PowerOn so the parser can be checked; do not share raw API responses.
- `UPSTREAM_BUSY`: wait at least one minute. `WORKER_SETUP`: required secrets
  are missing or malformed.

These diagnostics never include raw upstream messages, addresses, readings,
meter IDs, tokens or stack traces. They identify the failure, not necessarily its
underlying cause. A successful unauthenticated preflight does not validate a real
Eloverblik token or meter relation.

- **401 / key rejected:** use the separate app key, matching the Worker secret.
  To revoke access, replace `POWERON_APP_KEY` and reconnect with the new value.
- **403 / browser network error:** check `ALLOWED_ORIGIN` exactly; a URL path or
  trailing slash is wrong. Opening the Worker directly without an Origin header
  is intentionally refused. For local testing temporarily use
  `http://127.0.0.1:8123` as the allowed origin, then restore the production origin.
- **503:** check the required secrets. If configured, wait at least one minute:
  Eloverblik limits token requests to two per minute per IP. Warm Workers reuse
  access tokens for up to 23 hours, but cold starts may still hit that limit.
- **502:** check token validity, meter relation and dates. A production meter,
  unsupported resolution, malformed readings or a per-meter API error also fails
  closed. Do not log upstream responses to diagnose it: they may include personal
  information. Check Eloverblik directly and retry a shorter period.
- **No readings / partial period:** recent measurements may arrive late. Select
  an earlier completed week. Missing or incomplete data stays visibly missing.
- **Unpriced kWh:** the public price source may be unavailable or an old cached
  day may lack timestamps. Reload the period when connectivity returns.
- Keep Worker request/body logging disabled. The module logs no credentials or
  data and uses no Cloudflare Cache API. Responses are `private, no-store`.
- Monitor your account's Worker usage/limits in the dashboard. Pricing and plan
  allowances can change; this guide does not assume a paid plan or promise zero cost.

## Verification before considering the connection live

Automated synthetic tests run with `python dev/run-tests.py` and include the
Worker handler; no production tokens are required. Also run
`python dev/spec-check.py`. With your deployed Worker verify:

1. Missing/wrong app key cannot obtain data; a different origin cannot read it.
2. A completed day agrees with Eloverblik and has sensible coverage.
3. Expensive/Extreme kWh and costs match a small manually checked price sample.
4. Disconnect and reload remove readings; browser storage contains no app key or
   consumption. A late request cannot restore data after disconnect.
5. Try a DST period, unavailable recent dates and both spot/full modes.

Live credential validation must be completed after the owner configures the
account. Synthetic tests do not establish that a real meter is authorized.

## Official references

- [Eloverblik Customer API and schema](https://api.eloverblik.dk/CustomerApi/index.html)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare dashboard getting started](https://developers.cloudflare.com/workers/get-started/dashboard/)

API schema and Cloudflare secrets documentation checked on 2026-09-19.
