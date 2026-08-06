import { describe, expect, it } from "vitest";

import {
  addUsd,
  divideAndRound,
  formatUsdDecimal,
  parseUsdDecimal,
  ratioToBasisPoints,
  usd,
} from "@/src/domain/utilities/money";

describe("money utilities", () => {
  it.each([
    ["0", 0, "0.00"],
    ["12", 1200, "12.00"],
    ["12.3", 1230, "12.30"],
    ["12.34", 1234, "12.34"],
    ["-0.05", -5, "-0.05"],
  ])("parses and formats %s without floating-point arithmetic", (input, minorUnits, formatted) => {
    const money = parseUsdDecimal(input);
    expect(money).toEqual({ currency: "USD", minorUnits });
    expect(formatUsdDecimal(money)).toBe(formatted);
  });

  it.each(["$1.00", "1.234", "+1", "", " 1.00"])("rejects unsupported input %s", (input) => {
    expect(() => parseUsdDecimal(input)).toThrow(TypeError);
  });

  it("adds minor units exactly", () => {
    expect(addUsd([usd(100), usd(-25), usd(5)])).toEqual(usd(80));
  });

  it.each([
    [5, 2, 3],
    [4, 2, 2],
    [-5, 2, -3],
    [5, -2, -3],
    [-5, -2, 3],
  ])("rounds %i/%i half away from zero", (numerator, denominator, expected) => {
    expect(divideAndRound(numerator, denominator)).toBe(expected);
  });

  it("calculates basis points and handles a zero denominator", () => {
    expect(ratioToBasisPoints(1, 3)).toBe(3333);
    expect(ratioToBasisPoints(-1, 4)).toBe(-2500);
    expect(ratioToBasisPoints(1, 0)).toBeNull();
  });

  it("rejects unsafe integers and zero division", () => {
    expect(() => usd(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => addUsd([usd(Number.MAX_SAFE_INTEGER), usd(1)])).toThrow(RangeError);
    expect(() => divideAndRound(1, 0)).toThrow(RangeError);
    expect(() => divideAndRound(1.5, 1)).toThrow(RangeError);
    expect(() => ratioToBasisPoints(1, 1.5)).toThrow(RangeError);
  });
});
