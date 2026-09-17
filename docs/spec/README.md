# Specification

This folder is the source of truth for what PowerOn does. Code follows the spec;
when behaviour changes, the spec changes in the same commit.

## Files

| File | Prefix | Covers |
|---|---|---|
| [product.md](product.md) | – | Purpose, principles, non-goals, glossary |
| [data.md](data.md) | `DATA` | Sources, caching, refresh, time handling |
| [pricing.md](pricing.md) | `PRICE` | Spot, tariffs, taxes, VAT, price modes |
| [analysis.md](analysis.md) | `ANA` | Day window, levels, windows, factors |
| [day-view.md](day-view.md) | `DAY` | Today and Tomorrow |
| [appliances.md](appliances.md) | `APPL` | Appliance model and costs |
| [outlook.md](outlook.md) | `OUT` | Forecast model and Outlook tab |
| [history.md](history.md) | `HIST` | History tab |
| [settings.md](settings.md) | `SET` | Settings and persistence |
| [views.md](views.md) | `VIEW` | Simple / Full / Nerd |
| [pwa.md](pwa.md) | `PWA` | Manifest, service worker, install |
| [non-functional.md](non-functional.md) | `NFR` | Constraints and quality attributes |
| [traceability.md](traceability.md) | – | Generated: requirement → code → test |

## Requirement format

```markdown
### DATA-01 · Spot prices
**Status:** Implemented · **Priority:** Must · **Verify:** test

One sentence saying what the app MUST do.

- Acceptance criterion that can be checked.
- Another one.
```

- **ID** is `PREFIX-NN`, never reused and never renumbered. New requirements get
  the next free number in their file.
- **Status:** `Implemented`, `Partial`, `Planned` or `Deprecated`.
- **Priority:** `Must`, `Should` or `Could`.
- **Verify:** how we know it works — `test` (automated), `check` (spec-check
  script), `manual` (device or browser check), `review` (code review).
- MUST / SHOULD / MAY carry their usual meaning (RFC 2119).

## Traceability

Code and tests point back at requirements, not the other way round:

- In code: a comment `// @req DATA-01 DATA-02` above the function that implements it.
- In tests: the first argument of `test('DATA-01', 'name', …)` in `dev/tests/*.test.js`.

`python dev/spec-check.py` reads both, regenerates [traceability.md](traceability.md)
and fails when a requirement ID does not exist, when an ID is duplicated, or when
an implemented requirement has no code behind it.

## Changing the spec

1. Edit or add the requirement, including its acceptance criteria.
2. Change the code and tag it with `@req`.
3. Add or adjust a test when **Verify** says `test`.
4. Run `python dev/run-tests.py` and `python dev/spec-check.py`.
5. Commit spec, code and tests together, mentioning the IDs in the commit message.
