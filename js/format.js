// Number formatting. Danish number style (comma decimal) since all amounts are in kr.

const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const nfShort = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1.2345 → '1,23' (fixed number of decimals, default 2) */
// @req NFR-02
export function num(value, decimals = 2) {
  if (!Number.isFinite(value)) return '–';
  if (decimals === 2) return nf2.format(value);
  if (decimals === 3) return nf3.format(value);
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** 0.255 → '0,255' (up to 3 decimals, trailing zeros trimmed) */
export function numShort(value) {
  if (!Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits: 3 }).format(value);
}

/** Price per kWh: '1,23 kr./kWh' */
export function pricePerKwh(value) {
  return `${num(value)} kr./kWh`;
}

/** Amount in kr: '0,08 kr.' */
export function kr(value) {
  return `${num(value)} kr.`;
}

export function kwh(value) {
  return `${nfShort.format(value)} kWh`;
}

/** 3.5 → '3,5 h', 1 → '1 h' */
export function hours(value) {
  return `${nfShort.format(value)} h`;
}

/** Escape text for safe insertion into innerHTML. */
export function esc(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
