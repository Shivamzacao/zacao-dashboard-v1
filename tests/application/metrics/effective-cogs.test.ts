import { describe, expect, it } from "vitest";

import { buildEffectiveCogsMetric, hasCostableInventoryLots } from "@/src/application/metrics";

import { context, source } from "./fixtures";

const metricContext = context([source("google_sheets")]);

const costRow = (
  sku: string,
  effectiveFrom: string,
  components: {
    production?: number;
    packaging?: number;
    freight?: number;
    fulfillment?: number;
    duties?: number;
    statedTotal?: number;
    effectiveTo?: string;
  },
) => ({
  sku,
  effective_from: effectiveFrom,
  effective_to: components.effectiveTo ?? null,
  cost_basis: "landed",
  production_cost_usd: components.production ?? 0,
  packaging_usd: components.packaging ?? 0,
  freight_usd: components.freight ?? 0,
  fulfillment_usd: components.fulfillment ?? 0,
  duties_insurance_receiving_usd: components.duties ?? null,
  // Deliberately understated, mirroring the production workbook where every row's
  // stored total omits packaging. Nothing may read this.
  total_unit_cost_usd: components.statedTotal ?? components.production ?? 0,
});

const lot = (
  sku: string,
  remaining: number,
  receivedDate: string,
  poNumber: string | null = null,
) => ({
  sku,
  lot_number: `LOT-${sku}-${receivedDate}`,
  quantity_remaining: remaining,
  received_date: receivedDate,
  po_number: poNumber,
});

const order = (poNumber: string, received: number | null, accepted: number | null) => ({
  po_number: poNumber,
  received_units: received,
  accepted_units: accepted,
});

describe("Effective COGS per bar", () => {
  it("rebuilds landed cost from components and ignores the stored total", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 1.501, packaging: 0.09, freight: 0.8 })],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );

    // Components sum to 2.391; the stored total says 1.501 and must not be read.
    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 239 } });
    expect(metric.warnings).toContain("COGS_LANDED_COST_RECOMPUTED_FROM_COMPONENTS");
  });

  it("divides by accepted units, so rejected bars raise cost per saleable bar", () => {
    const costs = [costRow("SKU-01", "2026-07-01", { production: 2.1, packaging: 0.3 })];
    const withYield = buildEffectiveCogsMetric(
      metricContext,
      costs,
      [lot("SKU-01", 100, "2026-07-10", "PO-1")],
      [order("PO-1", 1_000, 800)],
    );
    const withoutLoss = buildEffectiveCogsMetric(
      metricContext,
      costs,
      [lot("SKU-01", 100, "2026-07-10", "PO-2")],
      [order("PO-2", 1_000, 1_000)],
    );

    // 2.40 spread over 800 accepted of 1,000 received = 3.00.
    expect(withYield.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 300 } });
    expect(withoutLoss.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 240 },
    });
  });

  it("carries a lot with no resolvable purchase order unadjusted, and discloses it", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2, packaging: 0.3 })],
      [lot("SKU-01", 100, "2026-07-10", "PO-MISSING")],
      [order("PO-OTHER", 1_000, 800)],
    );

    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 230 } });
    expect(metric.warnings).toContain("COGS_ESTIMATED_LOTS:1");
  });

  it("never substitutes received units when accepted units are absent", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2, packaging: 0.3 })],
      [lot("SKU-01", 100, "2026-07-10", "PO-1")],
      [order("PO-1", 1_000, null)],
    );

    // Unadjusted and disclosed, rather than quietly divided by received units.
    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 230 } });
    expect(metric.warnings).toContain("COGS_ESTIMATED_LOTS:1");
  });

  it("weights lots by the bars actually remaining on hand", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [
        costRow("SKU-01", "2026-07-01", { production: 2 }),
        costRow("SKU-02", "2026-07-01", { production: 3 }),
      ],
      [lot("SKU-01", 300, "2026-07-10"), lot("SKU-02", 100, "2026-07-10")],
      [],
    );

    // (300 x 2 + 100 x 3) / 400 = 2.25.
    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 225 } });
    expect(metric.warnings).toContain("COGS_LOTS_IN_AVERAGE:400");
  });

  it("costs a lot at its goods-received date, so a later record cannot restate it", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [
        costRow("SKU-01", "2026-07-01", { production: 2 }),
        costRow("SKU-01", "2026-07-20", { production: 5 }),
      ],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );

    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 200 } });
  });

  it("excludes a cost row that has already expired", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2, effectiveTo: "2026-07-05" })],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );

    expect(metric.value).toBeNull();
    expect(metric.warnings).toContain("COGS_LOT_COST_UNRESOLVED:1");
  });

  it("recognises no rebate, so effective COGS equals gross landed COGS", () => {
    const metric = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2, packaging: 0.3 })],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );

    expect(metric.value).toEqual({ kind: "money", value: { currency: "USD", minorUnits: 230 } });
    expect(metric.warnings).toContain("REBATE_NOT_RECOGNISED_NO_APPROVED_AGREEMENT");
  });

  it("stops disclosing uncaptured duties once the component is populated", () => {
    const withoutDuties = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2 })],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );
    const withDuties = buildEffectiveCogsMetric(
      metricContext,
      [costRow("SKU-01", "2026-07-01", { production: 2, duties: 0.15 })],
      [lot("SKU-01", 100, "2026-07-10")],
      [],
    );

    expect(withoutDuties.warnings).toContain("COGS_DUTIES_INSURANCE_RECEIVING_NOT_CAPTURED");
    expect(withDuties.warnings).not.toContain("COGS_DUTIES_INSURANCE_RECEIVING_NOT_CAPTURED");
    expect(withDuties.value).toEqual({
      kind: "money",
      value: { currency: "USD", minorUnits: 215 },
    });
  });

  it("treats a lot as costable only when its SKU has an effective landed cost", () => {
    const costs = [costRow("SKU-01", "2026-07-01", { production: 2 })];
    expect(hasCostableInventoryLots([lot("SKU-01", 100, "2026-07-10")], costs)).toBe(true);
    expect(hasCostableInventoryLots([lot("SKU-02", 100, "2026-07-10")], costs)).toBe(false);
    expect(hasCostableInventoryLots([lot("SKU-01", 0, "2026-07-10")], costs)).toBe(false);
  });
});
