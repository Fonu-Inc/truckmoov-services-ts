import { describe, expect, it, vi } from "vitest";
import { isTransientDbError, retryDbConnect } from "@shared/db";

const fast = { label: "test", baseDelayMs: 1, maxDelayMs: 2 };

function refused() {
  return Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
}

describe("isTransientDbError", () => {
  it("treats network loss, pool timeout and pg shutdown as transient", () => {
    expect(isTransientDbError(refused())).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("x"), { code: "57P03" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("x"), { name: "KnexTimeoutError" }))).toBe(true);
  });

  it("does not treat auth or SQL errors as transient", () => {
    expect(isTransientDbError(Object.assign(new Error("bad password"), { code: "28P01" }))).toBe(false);
    expect(isTransientDbError(Object.assign(new Error("no table"), { code: "42P01" }))).toBe(false);
    expect(isTransientDbError("nope")).toBe(false);
  });
});

describe("retryDbConnect", () => {
  it("retries until the database comes back", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(refused())
      .mockRejectedValueOnce(refused())
      .mockResolvedValue("connected");

    await expect(retryDbConnect(operation, fast)).resolves.toBe("connected");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt limit and rethrows the last error", async () => {
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(refused());

    await expect(retryDbConnect(operation, { ...fast, attempts: 3 })).rejects.toThrow("ECONNREFUSED");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("fails at once on a non-transient error", async () => {
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(Object.assign(new Error("bad password"), { code: "28P01" }));

    await expect(retryDbConnect(operation, fast)).rejects.toThrow("bad password");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
