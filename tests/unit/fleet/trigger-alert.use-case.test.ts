import { describe, expect, it } from "vitest";
import { TriggerAlertUseCase } from "../../../apps/fleet/src/contexts/fleet/alerts/application/trigger-alert.use-case";
import { InMemoryAlertRepository } from "../../../apps/fleet/src/contexts/fleet/alerts/infrastructure/in-memory-alert.repository";

describe("TriggerAlertUseCase", () => {
  function build() {
    const repo = new InMemoryAlertRepository();
    return { uc: new TriggerAlertUseCase(repo), repo };
  }

  it("creates and saves an alert", async () => {
    const { uc, repo } = build();
    const alert = await uc.execute({ id: "a1", tenantId: "t1", type: "geofence_exit", severity: "high" });
    expect(alert.status).toBe("open");
    expect(await repo.findById("t1", "a1")).not.toBeNull();
  });

  it("sets vehicleId and jobId when provided", async () => {
    const { uc } = build();
    const alert = await uc.execute({ id: "a2", tenantId: "t1", type: "speeding", severity: "medium", vehicleId: "v1", jobId: "j1" });
    expect(alert.vehicleId).toBe("v1");
    expect(alert.jobId).toBe("j1");
  });

  it("defaults vehicleId and jobId to null", async () => {
    const { uc } = build();
    const alert = await uc.execute({ id: "a3", tenantId: "t1", type: "idle", severity: "low" });
    expect(alert.vehicleId).toBeNull();
    expect(alert.jobId).toBeNull();
  });

  it("triggeredAt is set on creation", async () => {
    const { uc } = build();
    const alert = await uc.execute({ id: "a5", tenantId: "t1", type: "test", severity: "low" });
    expect(alert.triggeredAt).toBeInstanceOf(Date);
  });
});
