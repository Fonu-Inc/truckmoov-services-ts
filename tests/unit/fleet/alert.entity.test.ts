import { describe, expect, it } from "vitest";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";

function makeAlert(overrides: Partial<Parameters<typeof Alert.create>[0]> = {}) {
  return Alert.create({
    id: "a1",
    tenantId: "tenant-1",
    type: "geofence_exit",
    severity: "high",
    status: "open",
    vehicleId: "v1",
    jobId: null,
    details: {},
    triggeredAt: new Date("2026-03-16T08:00:00Z"),
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
    acknowledgedBy: null,
    resolvedBy: null,
    ...overrides,
  });
}

describe("Alert entity", () => {
  it("creates with required fields", () => {
    const a = makeAlert();
    expect(a.id).toBe("a1");
    expect(a.status).toBe("open");
  });

  it("throws for empty id", () => {
    expect(() => makeAlert({ id: "" })).toThrow("id is required");
  });

  it("throws for empty type", () => {
    expect(() => makeAlert({ type: "" })).toThrow("type is required");
  });

  it("acknowledge transitions to acknowledged", () => {
    const a = makeAlert().acknowledge("user-1");
    expect(a.status).toBe("acknowledged");
    expect(a.acknowledgedBy).toBe("user-1");
  });

  it("resolve transitions to resolved", () => {
    const a = makeAlert().resolve("user-2");
    expect(a.status).toBe("resolved");
    expect(a.resolvedBy).toBe("user-2");
  });

  it("escalate transitions to escalated", () => {
    const a = makeAlert().escalate();
    expect(a.status).toBe("escalated");
    expect(a.escalatedAt).not.toBeNull();
  });

  it("is immutable - original unchanged after acknowledge", () => {
    const original = makeAlert();
    original.acknowledge("user-1");
    expect(original.status).toBe("open");
  });

  it("toPrimitives returns plain object", () => {
    const p = makeAlert().toPrimitives();
    expect(p.severity).toBe("high");
  });
});
