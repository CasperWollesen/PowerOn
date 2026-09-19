# 0009 · Private Eloverblik Worker

**Status:** Accepted · 2026-09-19

## Context

Personal consumption cannot safely be fetched with credentials embedded in public
GitHub Pages. This intentionally extends the original no-backend scope.

## Decision

Keep the frontend dependency-free on GitHub Pages. Add a separately deployed,
dependency-free Cloudflare Worker for one household and one consumption meter.
Store Eloverblik credentials and the private app key as Cloudflare secrets. Require
a high-entropy bearer key entered into a password field for each browser session.
Keep readings and that key in memory; only the non-secret Worker URL is remembered.
Do not use cross-site cookies or require a custom domain. CORS limits browser
origins, while the app key authorizes requests independently.

Reuse the existing price model. Preserve absolute spot timestamps in the existing
cache, retaining compatibility with old entries. Fetch old timestamp-less entries
again only for usage analysis. Hourly tariff profiles retain their existing
approximation, disclosed with all usage cost estimates.

## Consequences

- No added frontend or Worker runtime dependencies; dashboard deployment works
  by pasting the single Worker module. No npm or build step is needed.
- Anyone holding the app key can read consumption. Generate at least 32 random
  bytes, keep it in a password manager and rotate the Worker secret to revoke it.
- No persistent consumption store, analytics, request-body logs or offline usage
  history. Reload requires the key again. The upstream access token is cached
  only within a warm Worker isolate; cold starts can hit Eloverblik rate limits.
- Authentication failures fail closed. Upstream 429/503 requests are not retried
  automatically; the user is told to wait at least a minute.
- This is an exception to decisions 0001/0005 for personal usage only. Public
  prices, existing storage and other tabs retain their behaviour.
- Cloudflare Access with identity-based login can replace the shared app key in
  a future decision; it is not required for this first, single-household version.
