import type { ComparisonMode, DateRange } from "../contracts";

function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

function toIsoDate(utcMilliseconds: number): string {
  return new Date(utcMilliseconds).toISOString().slice(0, 10);
}

function shiftByDays(date: string, days: number): string {
  const { year, month, day } = parseIsoDate(date);
  return toIsoDate(Date.UTC(year, month - 1, day + days));
}

function shiftByYears(date: string, years: number): string {
  const { year, month, day } = parseIsoDate(date);
  return toIsoDate(Date.UTC(year + years, month - 1, day));
}

function spanInDays(range: DateRange): number {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  const days =
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
    86_400_000;
  return days + 1;
}

/**
 * The immediately preceding period of equal length ("previous_period") or the
 * same calendar dates one year earlier ("previous_year"). Returns null for
 * "none" — no comparison fetch is needed.
 */
export function comparisonDateRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "previous_period") {
    const days = spanInDays(range);
    return {
      startDate: shiftByDays(range.startDate, -days),
      endDate: shiftByDays(range.endDate, -days),
    };
  }
  return {
    startDate: shiftByYears(range.startDate, -1),
    endDate: shiftByYears(range.endDate, -1),
  };
}
