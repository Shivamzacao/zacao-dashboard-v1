import type { DateRange, UsdMoney } from "../contracts";
import { addUsd, ratioToBasisPoints, usd } from "../utilities/money";

export function sumSafeNumbers(values: readonly number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new RangeError("Metric count must be a safe integer");
    return sum + BigInt(value);
  }, 0n);
  const result = Number(total);
  if (!Number.isSafeInteger(result))
    throw new RangeError("Metric count sum must be a safe integer");
  return result;
}

export function sumFiniteNumbers(values: readonly number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isFinite(value)) throw new RangeError("Metric value must be finite");
    return sum + value;
  }, 0);
  if (!Number.isFinite(total)) throw new RangeError("Metric sum must be finite");
  return total;
}

export function sumUsd(values: readonly UsdMoney[]): UsdMoney {
  return addUsd(values);
}

export function safeRateBasisPoints(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null) return null;
  return ratioToBasisPoints(numerator, denominator);
}

export function decimalRateToBasisPoints(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("Provider decimal rate must be between zero and one");
  }
  return Math.round(value * 10_000);
}

export function usdFromDecimalNumber(value: number): UsdMoney {
  if (!Number.isFinite(value)) throw new RangeError("USD value must be finite");
  const minorUnits = Math.round(value * 100);
  if (Math.abs(value * 100 - minorUnits) > 1e-8) {
    throw new RangeError("USD value must not contain fractions smaller than one cent");
  }
  return usd(minorUnits);
}

export function dateWithinRange(date: string, range: DateRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

export function groupSum<T>(
  rows: readonly T[],
  keyFor: (row: T) => string,
  valueFor: (row: T) => number,
): ReadonlyMap<string, number> {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), valueFor(row)]);
  }
  return new Map([...grouped].map(([key, values]) => [key, sumSafeNumbers(values)]));
}

export function approvedThresholdResult(input: {
  readonly actual: number | null;
  readonly threshold: number | null;
  readonly direction: "below" | "above";
}): "triggered" | "clear" | "business_rule_required" | "data_source_not_ready" {
  if (input.threshold === null) return "business_rule_required";
  if (input.actual === null) return "data_source_not_ready";
  return input.direction === "below"
    ? input.actual < input.threshold
      ? "triggered"
      : "clear"
    : input.actual > input.threshold
      ? "triggered"
      : "clear";
}
