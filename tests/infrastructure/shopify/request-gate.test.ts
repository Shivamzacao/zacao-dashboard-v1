import { describe, expect, it } from "vitest";

import { RequestGate } from "@/src/infrastructure/shopify/request-gate";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("RequestGate", () => {
  it("rejects a non-positive limit", () => {
    expect(() => new RequestGate(0)).toThrow(TypeError);
    expect(() => new RequestGate(1.5)).toThrow(TypeError);
  });

  it("never runs more operations at once than the limit allows", async () => {
    const gate = new RequestGate(2);
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred());

    const runs = gates.map((entry) =>
      gate.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await entry.promise;
        active -= 1;
      }),
    );

    // Only the first two may have started; the rest stay queued.
    await Promise.resolve();
    expect(peak).toBe(2);

    for (const entry of gates) entry.resolve();
    await Promise.all(runs);
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it("releases its slot when an operation rejects", async () => {
    const gate = new RequestGate(1);
    await expect(gate.run(() => Promise.reject(new Error("upstream failed")))).rejects.toThrow(
      "upstream failed",
    );
    await expect(gate.run(() => Promise.resolve("recovered"))).resolves.toBe("recovered");
  });

  it("preserves each caller's own result", async () => {
    const gate = new RequestGate(2);
    const results = await Promise.all([1, 2, 3, 4, 5].map((value) => gate.run(async () => value)));
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });
});
