// Price bands: an absolute judgement of a price, next to the relative
// "when today" signals.
//
// A price is put in one of five bands by comparing it with four thresholds the
// user can change. The bands are what every badge and colour in the app means,
// so "Fair" always means the same thing, whichever day or tab you are looking at.
//
// Thresholds are per price mode, because the full price includes roughly
// 0,25 kr./kWh of tariffs, tax and VAT that the spot price does not.

// @req BAND-01 BAND-05 BAND-06
export const BANDS = [
  { id: 'free', label: 'Near free', short: 'Free', icon: '⚡' },
  { id: 'cheap', label: 'Cheap', short: 'Cheap', icon: '' },
  { id: 'fair', label: 'Fair', short: 'Fair', icon: '' },
  { id: 'expensive', label: 'Expensive', short: 'Exp.', icon: '' },
  { id: 'extreme', label: 'Extreme', short: 'Extr.', icon: '🔥' },
];

export const BAND_LABEL = Object.fromEntries(BANDS.map((b) => [b.id, b.label]));

/**
 * Upper bound of the four lower bands, kr./kWh of the price being shown.
 * Chosen from a year of DK1 prices so the bands actually separate days:
 * with the full-price defaults about 12 % of hours land in Near free, 25 % in
 * Cheap, 46 % in Fair, 16 % in Expensive and 1 % in Extreme.
 */
export const DEFAULT_BANDS = Object.freeze({
  full: [0.5, 1.2, 2.0, 3.5],
  spot: [0.15, 0.6, 1.1, 1.8],
});

export const BAND_COUNT = BANDS.length;

/** The thresholds in use for the current price mode. */
export function bandEdges(settings) {
  const mode = settings.priceMode === 'spot' ? 'spot' : 'full';
  return settings.bands?.[mode] ?? DEFAULT_BANDS[mode];
}

/** Band id for a price. Prices below the first threshold are "free". */
export function bandFor(price, edges) {
  if (!Number.isFinite(price)) return 'fair';
  let index = 0;
  while (index < edges.length && price >= edges[index]) index += 1;
  return BANDS[index].id;
}

export function bandLabel(id) {
  return BAND_LABEL[id] ?? id;
}

export function bandIcon(id) {
  return BANDS.find((b) => b.id === id)?.icon ?? '';
}

/** How many bands apart two prices are; 0 when they share a band. */
export function bandDistance(a, b) {
  return Math.abs(BANDS.findIndex((x) => x.id === a) - BANDS.findIndex((x) => x.id === b));
}

/** Human range across bands: "Cheap" or "Near free → Fair". */
export function bandRangeLabel(lowBand, highBand) {
  return lowBand === highBand ? bandLabel(lowBand) : `${bandLabel(lowBand)} → ${bandLabel(highBand)}`;
}

/** The price range a band covers, for explaining a band in the interface. */
export function bandRange(id, edges) {
  const i = BANDS.findIndex((b) => b.id === id);
  return { from: i === 0 ? null : edges[i - 1], to: i === edges.length ? null : edges[i] };
}

/** Four ascending, positive thresholds; anything else falls back to the defaults. */
export function sanitizeEdges(values, mode = 'full') {
  const fallback = DEFAULT_BANDS[mode] ?? DEFAULT_BANDS.full;
  if (!Array.isArray(values) || values.length !== fallback.length) return [...fallback];
  const numbers = values.map(Number);
  if (numbers.some((v) => !Number.isFinite(v) || v <= 0)) return [...fallback];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] <= numbers[i - 1]) return [...fallback];
  }
  return numbers;
}
