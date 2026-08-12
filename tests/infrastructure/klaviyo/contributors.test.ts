import { describe, expect, it, vi } from "vitest";

import type { OrchestrationContext } from "@/src/application/orchestration";
import type { KlaviyoAdapter } from "@/src/infrastructure/klaviyo/adapter";
import { createKlaviyoContributors } from "@/src/infrastructure/klaviyo/contributors";

const context: OrchestrationContext = {
  environment: "production",
  dataPeriod: { startDate: "2026-07-01", endDate: "2026-07-31" },
  filters: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    channels: [],
    productSkus: [],
    locations: [],
  },
  reportingTimeZone: "America/New_York",
  currency: "USD",
  sourceStatuses: [],
};

describe("Klaviyo contributors", () => {
  it("does not request a values report for an empty campaign collection", async () => {
    const readCampaignReport = vi.fn();
    const readFlowReport = vi.fn().mockResolvedValue({ rows: [] });
    const adapter = {
      readEventPresence: vi.fn().mockResolvedValue(true),
      readCampaigns: vi.fn().mockResolvedValue({ records: [] }),
      readFlows: vi.fn().mockResolvedValue({ records: [{ id: "flow-1", name: "Welcome" }] }),
      readCampaignReport,
      readFlowReport,
    } as unknown as KlaviyoAdapter;
    const contributor = createKlaviyoContributors({
      adapter,
      sourceIdentity: "test.klaviyo",
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    }).find(({ dataset }) => dataset === "klaviyo-performance");

    if (!contributor) throw new Error("Missing Klaviyo performance contributor");
    await contributor.load(context);

    expect(readCampaignReport).not.toHaveBeenCalled();
    expect(readFlowReport).toHaveBeenCalledOnce();
    expect(readFlowReport).toHaveBeenCalledWith(context.dataPeriod);
  });
});
