import { describe, expect, it } from "vitest";

import { phase2FixtureProvider } from "@/src/presentation/providers/fixture-dashboard-provider";
import {
  dateRangeForPreset,
  parseFrontendFilterState,
  serializeDashboardFilters,
  updateFilterState,
} from "@/src/presentation/filters/url-filter-state";

const today = "2026-08-07" as const;
const supported = phase2FixtureProvider.getShellContext().supportedFilters;

describe("F1 URL filter state", () => {
  it("uses the approved rolling twelve-month default and round-trips deterministically", () => {
    const state = parseFrontendFilterState(new URLSearchParams(), supported, today);
    expect(state.filters).toMatchObject({
      startDate: "2025-08-08",
      endDate: "2026-08-07",
      comparison: "none",
      channels: [],
      productSkus: [],
      locations: [],
    });
    expect(
      parseFrontendFilterState(new URLSearchParams(state.query), supported, today),
    ).toMatchObject({
      filters: state.filters,
      query: serializeDashboardFilters(state.filters),
      recovered: false,
    });
  });

  it("rejects unsupported values and recovers malformed or unknown parameters", () => {
    const state = parseFrontendFilterState(
      new URLSearchParams(
        "start=bad&end=2026-08-07&comparison=future&channels=Unknown&provider=shopify",
      ),
      supported,
      today,
    );
    expect(state.recovered).toBe(true);
    expect(state.query).toBe("start=2025-08-08&end=2026-08-07&comparison=none");
  });

  it("uses only B7 allowlisted dimensions and canonical ordering", () => {
    const base = parseFrontendFilterState(new URLSearchParams(), supported, today);
    const next = updateFilterState(
      base,
      {
        channels: ["Website/DTC"],
        productSkus: ["SYNTH-SKU-1"],
        locations: ["SYNTH-WAREHOUSE"],
        comparison: "previous_year",
      },
      supported,
      today,
    );
    expect(next.query).toBe(
      "start=2025-08-08&end=2026-08-07&comparison=previous_year&channels=Website%2FDTC&skus=SYNTH-SKU-1&locations=SYNTH-WAREHOUSE",
    );
  });

  it("supports only the confirmed period presets", () => {
    expect(dateRangeForPreset("last_30_days", today)).toEqual({
      startDate: "2026-07-09",
      endDate: today,
    });
    expect(dateRangeForPreset("last_90_days", today).startDate).toBe("2026-05-10");
    expect(dateRangeForPreset("year_to_date", today).startDate).toBe("2026-01-01");
  });
});
