import { describe, expect, it } from "vitest";

import {
  buildHistoricalCompletenessMetric,
  buildKlaviyoNoActivityMetric,
  buildSopValidationMetric,
  buildSourceFreshnessTable,
} from "@/src/application/metrics";
import { context, source } from "./fixtures";

describe("B5 source readiness metrics", () => {
  it("exposes source timestamps without converting them into business freshness", () => {
    const statuses = [source("shopify"), source("klaviyo", "no_activity")];
    const table = buildSourceFreshnessTable(context(statuses), statuses);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toHaveProperty("checkedAt");
    expect(table.rows[0]).toHaveProperty("dataAsOf");
  });

  it("keeps aggregate and incomplete detailed Shopify history distinct", () => {
    const aggregate = buildHistoricalCompletenessMetric(context(), {
      mode: "aggregate",
      completeness: "complete",
      requestedStartDate: "2025-08-01",
      requestedEndDate: "2026-07-31",
      earliestDetailedRecordAt: null,
      warningCodes: [],
    });
    const detailed = buildHistoricalCompletenessMetric(context([source("shopify", "partial")]), {
      mode: "detailed",
      completeness: "partial",
      requestedStartDate: "2025-08-01",
      requestedEndDate: "2026-07-31",
      earliestDetailedRecordAt: "2026-06-01T00:00:00.000Z",
      warningCodes: ["SHOPIFY_DETAILED_HISTORY_PARTIAL"],
    });
    expect(aggregate.value).toEqual({ kind: "status", value: "Complete" });
    expect(detailed.value).toEqual({ kind: "status", value: "Partial" });
    expect(detailed.warnings).toContain("PARTIAL_SHOPIFY_HISTORY");
  });

  it("represents Klaviyo no activity and S&OP limitations as data-quality states", () => {
    const klaviyo = buildKlaviyoNoActivityMetric(
      context([source("klaviyo", "no_activity")]),
      false,
    );
    const sop = buildSopValidationMetric(context([source("google_drive")]), {
      worksheetNames: ["Production Schedule"],
      nonEmptyCellCount: 10,
      formulaCount: 2,
      formulaErrorCells: ["Production Schedule!A1"],
      placeholderCellCount: 1,
    });
    expect(klaviyo.value).toEqual({ kind: "status", value: "No activity yet" });
    expect(klaviyo.warnings).toContain("KLAVIYO_NO_ACTIVITY");
    expect(sop.warnings).toEqual(
      expect.arrayContaining(["SOP_FORMULA_ERRORS", "SOP_PLACEHOLDERS"]),
    );
  });
});
