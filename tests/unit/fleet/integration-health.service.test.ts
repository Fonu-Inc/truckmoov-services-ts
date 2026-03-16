import { describe, expect, it, vi, afterEach } from "vitest";
import { IntegrationHealthService } from "../../../apps/fleet/src/integration-health.service";

describe("IntegrationHealthService", () => {
  afterEach(() => vi.useRealTimers());

  it("returns null for unknown source", () => {
    const svc = new IntegrationHealthService();
    expect(svc.get("cpaas")).toBeNull();
  });

  it("records success and increments count", () => {
    const svc = new IntegrationHealthService();
    svc.recordSuccess("cpaas");
    svc.recordSuccess("cpaas");
    const h = svc.get("cpaas")!;
    expect(h.successCount).toBe(2);
    expect(h.failureCount).toBe(0);
  });

  it("records failure and increments count", () => {
    const svc = new IntegrationHealthService();
    svc.recordFailure("erp");
    const h = svc.get("erp")!;
    expect(h.failureCount).toBe(1);
  });

  it("healthy = true when lastReceived within 1 hour", () => {
    const svc = new IntegrationHealthService();
    svc.recordSuccess("gps_webhook");
    expect(svc.get("gps_webhook")!.healthy).toBe(true);
  });

  it("healthy = false when lastReceived is null", () => {
    const svc = new IntegrationHealthService();
    svc.recordFailure("cpaas");
    expect(svc.get("cpaas")!.healthy).toBe(false);
  });

  it("healthy = false when lastReceived older than 1 hour", () => {
    vi.useFakeTimers();
    const svc = new IntegrationHealthService();
    vi.setSystemTime(new Date("2026-03-16T08:00:00Z"));
    svc.recordSuccess("cpaas");
    vi.setSystemTime(new Date("2026-03-16T09:01:00Z"));
    expect(svc.get("cpaas")!.healthy).toBe(false);
  });

  it("getAll returns all tracked sources", () => {
    const svc = new IntegrationHealthService();
    svc.recordSuccess("cpaas");
    svc.recordFailure("erp");
    const all = svc.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((h) => h.source)).toContain("cpaas");
    expect(all.map((h) => h.source)).toContain("erp");
  });

  it("lastReceived is iso string", () => {
    const svc = new IntegrationHealthService();
    svc.recordSuccess("cpaas");
    expect(svc.get("cpaas")!.lastReceived).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
