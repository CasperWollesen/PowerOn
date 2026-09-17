# 0006 · Fixed Y axis on charts

**Status:** Accepted · 2026-09-10

## Context

Most price apps auto-scale the Y axis to the day being shown. A calm, expensive
day then looks exactly like a windy, cheap one, and the user cannot compare two
days by eye. The user asked explicitly for a fixed scale.

## Decision

The hourly chart always runs from 0 to a configured maximum, default 10 kr./kWh.
Bars above the maximum are clipped and marked, never rescaled. The history chart
uses a fixed scale of half that value for daily ranges.

## Consequences

- Days are visually comparable, which is the point.
- On very cheap days the bars are short; the numbers and the level colours carry
  the detail instead.
- The maximum is a setting, so the user can tighten it if their prices never come
  near 10 kr.
