import { describe, expect, it } from "vitest";
import { GetAlertStatsUseCase } from "../../../apps/fleet/src/contexts/fleet/alerts/application/get-alert-stats.use-case";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";
import { InMemoryAlertRepository } from "../../../apps/fleet/src/contexts/fleet/alerts/infrastructure/in-memory-alert.repository";

const alert = (id: string, status: "open" | "resolved", resolvedAt: Date | null = null) =>
  Alert.create({ id, tenantId: "t1", type: "geofence_exit", severity: "high", status, vehicleId: "v1", jobId: null, details: {}, triggeredAt: new Date(0), acknowledgedAt: null, resolvedAt, escalatedAt: null, acknowledgedBy: null, resolvedBy: null });

describe("GetAlertStatsUseCase", () => {
  it("adds up grouped counts without loading the alerts", async () => {
    const repo = new InMemoryAlertRepository();
    await repo.save(alert("a1", "open"));
    await repo.save(alert("a2", "resolved", new Date(4000)));
    repo.findAll = () => {
      throw new Error("stats must not load every alert");
    };

    expect(await new GetAlertStatsUseCase(repo).execute("t1")).toEqual({
      total: 2,
      byStatus: { open: 1, resolved: 1 },
      byType: { geofence_exit: 2 },
      bySeverity: { high: 2 },
      meanTimeToResolveMs: 4000,
    });
  });
});
