import { describe, expect, it } from "vitest";

import {
  BLENDED_LANDED_COGS_PER_BAR_USD,
  CHANNEL_ECONOMICS,
  channelContributionMarginBasisPoints,
  channelEconomics,
} from "@/src/domain/metrics/channel-economics";

describe("channel economics configuration", () => {
  it("marks every rate unapproved except the one ZACAO actually supplied", () => {
    const approved = Object.entries(CHANNEL_ECONOMICS)
      .filter(([, economics]) => economics.approved)
      .map(([channel]) => channel);
    // Only TikTok Shop's 8% is in the workbook. If this list grows, a placeholder
    // was promoted to approved without the rate being confirmed — which is how an
    // invented number quietly becomes a reported margin.
    expect(approved).toEqual(["TikTok Shop"]);
  });

  it("does not charge the TikTok platform fee twice", () => {
    // The workbook states the same fee two ways: Variable Fee % 0.08 and Other
    // Fees / Bar 0.7192, which is 8% of the $8.99 price. Only one may be applied.
    const tiktok = channelEconomics("TikTok Shop");
    expect(tiktok?.variableFeeRate).toBe(0.08);
    expect(tiktok?.pricePerBarUsd).toBe(8.99);
  });

  it("has no economics for Unclassified, so its margin stays unknown", () => {
    expect(channelEconomics("Unclassified")).toBeNull();
    expect(
      channelContributionMarginBasisPoints({
        channel: "Unclassified",
        revenueMinorUnits: 500_00,
        orders: 10,
      }),
    ).toEqual({ basisPoints: null, marginMinorUnits: null, provisional: false });
  });
});

describe("channelContributionMarginBasisPoints", () => {
  it("subtracts COGS, the channel take rate, and fulfillment", () => {
    // One TikTok order of 100 bars at $8.99 = $899.00.
    //   COGS        100 × 2.494 = 249.40
    //   platform    899.00 × 0.08 = 71.92
    //   fulfilment  1 order × 7.96 = 7.96
    //   margin      899.00 − 249.40 − 71.92 − 7.96 = 569.72  ->  63.37%
    const result = channelContributionMarginBasisPoints({
      channel: "TikTok Shop",
      revenueMinorUnits: 899_00,
      orders: 1,
    });
    expect(result.marginMinorUnits).toBe(569_72);
    expect(result.basisPoints).toBe(6337);
    expect(result.provisional).toBe(false);
  });

  it("flags margin built from a placeholder rate as provisional", () => {
    const result = channelContributionMarginBasisPoints({
      channel: "ShopMy",
      revenueMinorUnits: 899_00,
      orders: 1,
    });
    expect(result.basisPoints).not.toBeNull();
    expect(result.provisional).toBe(true);
  });

  it("returns null rather than 0% when there is no revenue to divide by", () => {
    // A missing denominator is not a zero margin (specification §2, safe_divide).
    expect(
      channelContributionMarginBasisPoints({
        channel: "TikTok Shop",
        revenueMinorUnits: 0,
        orders: 0,
      }),
    ).toEqual({ basisPoints: null, marginMinorUnits: null, provisional: false });
  });

  it("reports a negative margin when costs exceed revenue instead of clamping", () => {
    // Wholesale at $4.50/bar barely clears a $2.494 bar once Faire's cut lands;
    // a single tiny order should be allowed to come out underwater.
    const result = channelContributionMarginBasisPoints({
      channel: "Wholesale / Faire",
      revenueMinorUnits: 4_50,
      orders: 1,
    });
    expect(result.basisPoints).toBeLessThan(10_000);
    expect(result.marginMinorUnits).not.toBeNull();
  });

  it("uses the blended per-bar cost, since channel facts carry no unit counts", () => {
    // Revenue of exactly one bar on a zero-fee channel leaves price − blended COGS.
    const result = channelContributionMarginBasisPoints({
      channel: "Events / Pop-ups",
      revenueMinorUnits: 8_99,
      orders: 0,
    });
    expect(result.marginMinorUnits).toBe(Math.round((8.99 - BLENDED_LANDED_COGS_PER_BAR_USD) * 100));
  });
});
