/**
 * ShopifyQL reports `day_of_week` inconsistently across shops: some return
 * weekday names ("Friday"), others a bare 0-6 index. Encoding normalization is
 * still an open item in `docs/research/02_SHOPIFY_DATA_AUDIT.md`, so both forms
 * are resolved here — once — before any label reaches the display layer.
 *
 * Numeric codes are read against `WEEKDAY_NAMES` below, i.e. 0 = Sunday. If a
 * shop is confirmed to emit a Monday-first index, rotate this array rather than
 * patching label sites.
 */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const HOURS_PER_DAY = 24;

const weekdayIndexByToken = new Map<string, number>(
  WEEKDAY_NAMES.flatMap((name, index): readonly (readonly [string, number])[] => [
    [name.toLowerCase(), index],
    [name.slice(0, 3).toLowerCase(), index],
  ]),
);

/** Resolves a provider weekday token to a 0-6 index, or null when unrecognized. */
export function weekdayIndex(raw: string): number | null {
  const token = raw.trim();
  const named = weekdayIndexByToken.get(token.toLowerCase());
  if (named !== undefined) return named;
  if (!/^\d+$/.test(token)) return null;
  const numeric = Number(token);
  return numeric < WEEKDAY_NAMES.length ? numeric : null;
}

/** Resolves a provider hour token to a 0-23 hour, or null when unrecognized. */
export function hourOfDay(raw: string): number | null {
  const token = raw.trim();
  if (!/^\d+$/.test(token)) return null;
  const numeric = Number(token);
  return numeric < HOURS_PER_DAY ? numeric : null;
}

/** Reporting-hour label such as `12 AM`, `9 AM`, `1 PM`. */
export function hourLabel(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;
}
