# 0001 · Plain HTML, CSS and JavaScript, no build step

**Status:** Accepted · 2026-09-10

## Context

A personal app for one household, hosted on GitHub Pages. It must be quick to
change months from now, without a toolchain that has rotted in the meantime.

## Decision

Plain HTML, CSS and ES modules, loaded directly by the browser. No framework, no
bundler, no transpiler, no package manager. Files are deployed exactly as they are
written. A chart library was considered and rejected; the chart is HTML and CSS.

React can be introduced later if the app outgrows this, and the domain modules are
pure functions precisely so they would survive that move.

## Consequences

- Deploy is `git push`; there is no build to break.
- Every path is relative so the app works from a repository subpath.
- Tests run in a browser instead of Node, see [0007](0007-spec-and-tests.md).
- Shared code is organised by module boundaries rather than by components.
- The service worker's file list must be maintained by hand, which `spec-check.py`
  now verifies.
