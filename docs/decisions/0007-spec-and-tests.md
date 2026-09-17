# 0007 · Spec with IDs, browser tests and a spec-check script

**Status:** Accepted · 2026-09-17

## Context

The app is built in short bursts, often with an AI assistant, weeks apart. Without
a written specification each session re-derives what the app is supposed to do,
and behaviour drifts. The user asked for documentation that implementations can be
held up against, and a plan that makes sprints easy to run.

Any tooling must obey [0001](0001-plain-web-no-build.md): no Node, no packages.

## Decision

1. `docs/spec/` holds numbered requirements (`DATA-01`, `PRICE-01`, …) with
   acceptance criteria, status and how each is verified.
2. Code carries `// @req ID` comments, tests take the IDs as their first argument.
3. `python dev/spec-check.py` regenerates the traceability matrix, and fails on
   unknown or duplicated IDs, on implemented requirements with no code behind
   them, and on a service worker file list that has drifted.
4. `dev/tests/` is a tiny browser test harness; `python dev/run-tests.py` runs it
   headless in Chrome and reports pass/fail.
5. GitHub Actions runs both on every push.

## Consequences

- The specification is the single source of truth; traceability is generated, so
  it cannot silently go stale.
- Only Python and a browser are needed, both already present.
- Tests cover the pure modules. Views are verified manually against the checklist
  in [../verification.md](../verification.md), which keeps the harness small.
- Writing the requirement before the code is now part of the workflow, described
  in [../../AGENTS.md](../../AGENTS.md).
