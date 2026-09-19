// Time helpers. All "wall clock" values are in Danish time (Europe/Copenhagen),
// independent of the device's time zone, so the app also works when travelling.

const TZ = 'Europe/Copenhagen';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Current Danish wall-clock time: { date: 'YYYY-MM-DD', hour, minute }. */
// @req DATA-09
export function nowInDenmark(now = new Date()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Add whole days to a 'YYYY-MM-DD' string (calendar arithmetic, DST-safe). */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Absolute instant of Danish midnight, including DST transitions. */
// @req USE-02
export function danishMidnight(date) {
  let instant = Date.parse(`${date}T00:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const local = nowInDenmark(new Date(instant));
    const wall = Date.parse(`${local.date}T00:00:00Z`) + local.hour * 3600000 + local.minute * 60000;
    instant += Date.parse(`${date}T00:00:00Z`) - wall;
  }
  return instant;
}

/** 'YYYY-MM-DD' → '10/9' style short label. */
export function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d}/${m}`;
}

/** Weekday name for a 'YYYY-MM-DD' date. */
export function weekdayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** 13 → '13:00' */
export function formatHour(hour) {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

/** (13, 16) → '13–16' – compact range for labels. */
export function formatHourRange(startHour, endHour) {
  return `${String(startHour).padStart(2, '0')}–${String(endHour % 24 || (endHour === 24 ? 24 : 0)).padStart(2, '0')}`;
}

/** Hour (0–23) from an ISO string with offset, e.g. '2026-09-10T13:00:00+02:00'. */
export function hourFromIso(iso) {
  return Number(iso.slice(11, 13));
}

/** Date part 'YYYY-MM-DD' from an ISO string with offset. */
export function dateFromIso(iso) {
  return iso.slice(0, 10);
}
