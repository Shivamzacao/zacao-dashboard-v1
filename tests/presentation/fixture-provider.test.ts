import { describe, expect, it } from "vitest";

import {
  createFixtureDashboardProvider,
  phase2FixtureProvider,
} from "@/src/presentation/providers/fixture-dashboard-provider";

describe("F1 Phase 2 fixture provider", () => {
  it("validates and exposes the frozen B7 synthetic TEST boundary", () => {
    expect(phase2FixtureProvider.kind).toBe("fixture");
    expect(phase2FixtureProvider.getShellContext()).toMatchObject({
      environment: "test",
      synthetic: true,
      supportedFilters: {
        channels: ["Website/DTC"],
        productSkus: ["SYNTH-SKU-1"],
        locations: ["SYNTH-WAREHOUSE"],
      },
    });
    expect(phase2FixtureProvider.getRepresentativeDashboard().ok).toBe(true);
    expect(phase2FixtureProvider.getShellContext().supportedFilters).not.toHaveProperty(
      "comparisons",
    );
    expect(phase2FixtureProvider.getF3PageData("customers").currentValues).toHaveProperty(
      "klaviyo.email_open_rate",
    );
    expect(phase2FixtureProvider.getF3PageData("marketing").currentValues).not.toHaveProperty(
      "klaviyo.email_open_rate",
    );
  });

  it("rejects unlabelled or structurally invalid fixtures", () => {
    expect(() =>
      createFixtureDashboardProvider({
        environment: "production",
        synthetic: false,
        dashboard: {},
        drilldown: {},
      }),
    ).toThrow("synthetic TEST data");

    expect(() =>
      createFixtureDashboardProvider({
        environment: "test",
        synthetic: true,
        dashboard: {},
        drilldown: {},
      }),
    ).toThrow();
  });
});
