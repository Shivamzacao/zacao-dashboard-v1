import type { UsdMoney } from "../contracts";

const USD_DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

function roundedBigIntDivision(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError("denominator must not be zero");
  }

  const isNegative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded = remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;
  return isNegative ? -rounded : rounded;
}

function bigintToSafeNumber(value: bigint, label: string): number {
  const result = Number(value);
  assertSafeInteger(result, label);
  return result;
}

export function usd(minorUnits: number): UsdMoney {
  assertSafeInteger(minorUnits, "minorUnits");
  return { currency: "USD", minorUnits };
}

export function parseUsdDecimal(input: string): UsdMoney {
  const match = USD_DECIMAL_PATTERN.exec(input);
  if (!match) {
    throw new TypeError("USD input must be a plain decimal with at most two fractional digits");
  }

  const isNegative = input.startsWith("-");
  const unsigned = isNegative ? input.slice(1) : input;
  const decimalIndex = unsigned.indexOf(".");
  const wholeText = decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionText = decimalIndex === -1 ? "" : unsigned.slice(decimalIndex + 1);
  const sign = isNegative ? -1n : 1n;
  const whole = BigInt(wholeText);
  const fraction = BigInt(fractionText.padEnd(2, "0"));
  return usd(bigintToSafeNumber(sign * (whole * 100n + fraction), "USD minor units"));
}

export function formatUsdDecimal(value: UsdMoney): string {
  const sign = value.minorUnits < 0 ? "-" : "";
  const absolute = Math.abs(value.minorUnits);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function addUsd(values: readonly UsdMoney[]): UsdMoney {
  const total = values.reduce((sum, value) => sum + BigInt(value.minorUnits), 0n);
  return usd(bigintToSafeNumber(total, "USD sum"));
}

export function divideAndRound(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  return bigintToSafeNumber(
    roundedBigIntDivision(BigInt(numerator), BigInt(denominator)),
    "rounded quotient",
  );
}

export function ratioToBasisPoints(numerator: number, denominator: number): number | null {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator === 0) {
    return null;
  }
  return bigintToSafeNumber(
    roundedBigIntDivision(BigInt(numerator) * 10_000n, BigInt(denominator)),
    "basis points",
  );
}
