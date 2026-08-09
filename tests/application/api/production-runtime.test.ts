import { describe, expect, it } from "vitest";

import { BackendApiService, dashboardApiResponseSchema } from "@/src/application/api";
import { createApiHandlers, DefaultBackendApiRuntime } from "@/src/infrastructure/api";

import { API_QUERY, FIXED_NOW } from "./fixtures";

describe("B7 production runtime isolation", () => {
  it("returns truthful empty/deferred production states and never TEST values", async () => {
    const now = () => new Date(FIXED_NOW);
    const runtime = new DefaultBackendApiRuntime();
    const handlers = createApiHandlers(new BackendApiService(runtime, now), now);
    const response = await handlers.dashboard(
      new Request(`https://example.test/api/v1/dashboards/executive?${API_QUERY}`),
      "executive",
    );
    const body = dashboardApiResponseSchema.parse(await response.json());

    expect(runtime.environment).toBe("production");
    expect(body.data.page.sources).not.toHaveLength(0);
    expect(body.data.page.sources.every(({ state }) => state === "not_configured")).toBe(true);
    expect(
      body.data.page.sources.every(({ warningCodes }) =>
        warningCodes.includes("LIVE_CREDENTIAL_VERIFICATION_DEFERRED"),
      ),
    ).toBe(true);
    expect(body.data.page.metrics.every(({ value }) => value === null)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/SYNTH-|Synthetic|example\.com/i);
  });
});
