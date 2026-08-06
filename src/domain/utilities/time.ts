import type { IsoDate } from "../contracts";

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface ZonedDateTimeParts extends CalendarDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

function zonedParts(instant: Date, timeZone: string): ZonedDateTimeParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function asUtcMilliseconds(parts: ZonedDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function midnightUtcFor(date: CalendarDate, timeZone: string): Date {
  const desired: ZonedDateTimeParts = { ...date, hour: 0, minute: 0, second: 0 };
  const desiredWallClock = asUtcMilliseconds(desired);
  let candidate = desiredWallClock;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = asUtcMilliseconds(zonedParts(new Date(candidate), timeZone));
    const adjustment = desiredWallClock - observed;
    candidate += adjustment;
    if (adjustment === 0) {
      return new Date(candidate);
    }
  }

  /* v8 ignore next -- defensive convergence guard; valid IANA midnight inputs converge above */
  throw new RangeError(`Could not resolve midnight for ${formatCalendarDate(date)} in ${timeZone}`);
}

function parseCalendarDate(date: IsoDate): CalendarDate {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function formatCalendarDate(date: CalendarDate): IsoDate {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    formatterFor(timeZone).format(new Date(0));
  } catch {
    throw new RangeError(`Unsupported IANA timezone: ${timeZone}`);
  }
}

export function dateInTimeZone(instant: Date, timeZone: string): IsoDate {
  const { year, month, day } = zonedParts(instant, timeZone);
  return formatCalendarDate({ year, month, day });
}

export function reportingDayBounds(
  date: IsoDate,
  timeZone: string,
): Readonly<{ start: Date; endExclusive: Date }> {
  assertValidTimeZone(timeZone);
  const calendarDate = parseCalendarDate(date);
  return {
    start: midnightUtcFor(calendarDate, timeZone),
    endExclusive: midnightUtcFor(addCalendarDays(calendarDate, 1), timeZone),
  };
}
