import { describe, expect, it } from "vitest";

import {
  columnLabel,
  describeColumns,
  formatCell,
} from "@/src/presentation/features/dashboard-pages/table-presentation";

describe("drill-down table presentation", () => {
  it("turns contract field names into reader-facing headers", () => {
    expect(columnLabel("priceMinorUnits")).toBe("Price");
    expect(columnLabel("conversionValueMinorUnits")).toBe("Conversion value");
    expect(columnLabel("deliveryRateBasisPoints")).toBe("Delivery rate");
    expect(columnLabel("sku")).toBe("SKU");
    expect(columnLabel("poNumber")).toBe("PO number");
    expect(columnLabel("expectedArrivalDate")).toBe("Expected arrival date");
  });

  it("renders stored units as the amounts they represent", () => {
    expect(formatCell("priceMinorUnits", 3600)).toBe("$36.00");
    expect(formatCell("openRateBasisPoints", 4250)).toBe("42.5%");
    expect(formatCell("units", 1234)).toBe("1,234");
    expect(formatCell("status", "ACTIVE")).toBe("Active");
    expect(formatCell("payoutStatus", "IN_TRANSIT")).toBe("In transit");
    expect(formatCell("bestByDate", "2026-11-02")).toBe("Nov 2, 2026");
    expect(formatCell("period", "2026-07")).toBe("Jul 2026");
    expect(formatCell("sku", null)).toBe("—");
  });

  it("drops columns whose every value is an opaque identifier URI", () => {
    const rows = [
      {
        variantId: "gid://shopify/ProductVariant/49913834570035",
        product: "70% Cacao Dark Chocolate",
        sku: "ZAC-DC-70-4PK",
        priceMinorUnits: 3600,
      },
      {
        variantId: "gid://shopify/ProductVariant/49913834602803",
        product: "70% Cacao Dark Chocolate",
        sku: "ZAC-DC-70-10PK",
        priceMinorUnits: 8500,
      },
    ];
    const columns = describeColumns(rows);
    expect(columns.map(({ key }) => key)).toEqual(["product", "sku", "priceMinorUnits"]);
    expect(columns.map(({ label }) => label)).toEqual(["Product", "SKU", "Price"]);
    expect(columns.find(({ key }) => key === "priceMinorUnits")?.numeric).toBe(true);
  });

  it("keeps identifier-named columns that readers can actually read", () => {
    const columns = describeColumns([{ opportunityId: "OPP-2041", stage: "NEGOTIATION" }]);
    expect(columns.map(({ key }) => key)).toEqual(["opportunityId", "stage"]);
  });

  it("returns no columns for an empty dataset", () => {
    expect(describeColumns([])).toEqual([]);
  });

  it("omits explicitly hidden columns without changing the row data", () => {
    const rows = [{ product: "Dark Chocolate", sku: "ZAC-DC-70", status: "ACTIVE" }];
    expect(describeColumns(rows, ["sku"]).map(({ key }) => key)).toEqual(["product", "status"]);
    expect(rows[0]?.sku).toBe("ZAC-DC-70");
  });

  it("supports page-specific column order and labels without changing row contracts", () => {
    const rows = [{ name: "Welcome", recipients: 100, openRateBasisPoints: 5200 }];
    const columns = describeColumns(rows, [], {
      order: ["name", "openRateBasisPoints", "recipients"],
      labels: { name: "Campaign", recipients: "Sent", openRateBasisPoints: "Open rate" },
    });
    expect(columns.map(({ key, label }) => [key, label])).toEqual([
      ["name", "Campaign"],
      ["openRateBasisPoints", "Open rate"],
      ["recipients", "Sent"],
    ]);
  });
});
