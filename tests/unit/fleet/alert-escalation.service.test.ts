import { describe, expect, it } from "vitest";
import { AlertEscalationService } from "../../../apps/fleet/src/alert-escalation.service";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";
import { InMemoryAlertRepository } from "../../../apps/fleet/src/contexts/fleet/alerts/infrastructure/in-memory-alert.repository";

const NOW = new Date("2026-02-02T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function alert(id: string, tenantId: string, triggeredAt: Date, status: "open" | "acknowledged" = "open") {
  return Alert.create({
    id, tenantId, type: "geofence_exit", severity: "high", status, vehicleId: "v1", jobId: null, details: {},
    triggeredAt, acknowledgedAt: null, resolvedAt: null, escalatedAt: null, acknowledgedBy: null, resolvedBy: null,
  });
}

describe("AlertEscalationService", () => {
  const service = (repo: InMemoryAlertRepository) =>
    new AlertEscalationService(repo, { fleet: { alertEscalationMinutes: 30 } } as never);

  it("escalates stale open alerts for every real tenant", async () => {
    const repo = new InMemoryAlertRepository();
    await repo.save(alert("a1", "acme", minutesAgo(45)));
    await repo.save(alert("a2", "globex", minutesAgo(31)));
    await repo.save(alert("a3", "acme", minutesAgo(5)));
    await repo.save(alert("a4", "acme", minutesAgo(90), "acknowledged"));

    expect(await service(repo).escalateStale(NOW)).toBe(2);

    expect((await repo.findById("acme", "a1"))?.status).toBe("escalated");
    expect((await repo.findById("globex", "a2"))?.status).toBe("escalated");
    expect((await repo.findById("acme", "a3"))?.status).toBe("open");
    expect((await repo.findById("acme", "a4"))?.status).toBe("acknowledged");
  });

  it("does nothing when no alert is stale", async () => {
    const repo = new InMemoryAlertRepository();
    await repo.save(alert("a1", "acme", minutesAgo(1)));
    expect(await service(repo).escalateStale(NOW)).toBe(0);
  });
});
