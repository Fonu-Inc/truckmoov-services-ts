import { describe, expect, it } from "vitest";
import { SharedWindowLimit } from "@shared/http";

describe("SharedWindowLimit", () => {
  it("counts across callers and trips past the limit", async () => {
    let n = 0;
    const limit = new SharedWindowLimit({ eval: async () => ++n }, "t", 2, 0.1);
    expect(limit.windowSeconds).toBe(20);
    expect(await limit.exceeded("k")).toBe(false);
    expect(await limit.exceeded("k")).toBe(false);
    expect(await limit.exceeded("k")).toBe(true);
  });

  it("fails open on Redis errors and stops calling it for a while", async () => {
    let calls = 0;
    const limit = new SharedWindowLimit({ eval: async () => { calls++; throw new Error("down"); } }, "t", 1, 1);
    expect(await limit.exceeded("k")).toBe(false);
    expect(await limit.exceeded("k")).toBe(false);
    expect(calls).toBe(1);
  });
});
