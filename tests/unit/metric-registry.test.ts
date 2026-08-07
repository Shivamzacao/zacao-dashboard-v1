import { describe, expect, it } from "vitest";

import type { MetricDefinition } from "@/src/domain/contracts";
import { createMetricRegistry, metricRegistry } from "@/src/domain/metrics/registry";

const definition: MetricDefinition = {
  key: "test.metric",
  schemaVersion: "1.0",
  definitionVersion: "1.0",
  classification: "core",
  valueKind: "count",
  sourceKeys: ["shopify"],
  description: "Synthetic definition used only to test the registry contract.",
};

describe("metric registry", () => {
  it("contains every active B5 definition exactly once", () => {
    expect(metricRegistry.definitions.length).toBeGreaterThan(0);
    expect(new Set(metricRegistry.definitions.map(({ key }) => key)).size).toBe(
      metricRegistry.definitions.length,
    );
  });

  it("registers and retrieves a versioned definition", () => {
    const registry = createMetricRegistry([definition]);
    expect(registry.get("test.metric")).toEqual(definition);
    expect(registry.get("missing.metric")).toBeUndefined();
  });

  it("rejects duplicate keys", () => {
    expect(() => createMetricRegistry([definition, definition])).toThrow("Duplicate metric key");
  });

  it("rejects invalid keys or versions", () => {
    expect(() => createMetricRegistry([{ ...definition, key: "Invalid" }])).toThrow();
    expect(() => createMetricRegistry([{ ...definition, definitionVersion: "latest" }])).toThrow();
  });
});
