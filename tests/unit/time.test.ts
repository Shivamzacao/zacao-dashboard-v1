import { describe, expect, it } from "vitest";

import { dateInTimeZone, reportingDayBounds } from "@/src/domain/utilities/time";

describe("timezone utilities", () => {
  it("derives reporting dates independently of the machine timezone", () => {
    expect(dateInTimeZone(new Date("2026-01-01T02:00:00.000Z"), "America/New_York")).toBe(
      "2025-12-31",
    );
  });

  it("returns a 23-hour reporting day across spring DST", () => {
    const bounds = reportingDayBounds("2026-03-08", "America/New_York");
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(bounds.endExclusive.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("returns a 25-hour reporting day across fall DST", () => {
    const bounds = reportingDayBounds("2026-11-01", "America/New_York");
    expect(bounds.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(bounds.endExclusive.getTime() - bounds.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("supports calendar rollover", () => {
    const bounds = reportingDayBounds("2026-12-31", "America/New_York");
    expect(bounds.endExclusive.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  it("rejects an invalid IANA timezone", () => {
    expect(() => reportingDayBounds("2026-01-01", "Not/A_Zone")).toThrow(RangeError);
  });
});
