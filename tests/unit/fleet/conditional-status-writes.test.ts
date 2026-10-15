import { describe, expect, it } from "vitest";
import { AlertEscalationService } from "../../../apps/fleet/src/alert-escalation.service";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";
import { InMemoryAlertRepository } from "../../../apps/fleet/src/contexts/fleet/alerts/infrastructure/in-memory-alert.repository";
import { ExpireStalledWaybillsUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/expire-stalled-waybills.use-case";
import { Waybill } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/waybill.entity";
import { InMemoryWaybillRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-waybill.repository";

const NOW = new Date("2026-10-15T12:00:00.000Z");

describe("Sweeps never overwrite a concurrent change", () => {
  it("leaves an alert acknowledged between the escalation read and write", async () => {
    const repo = new InMemoryAlertRepository();
    const open = Alert.create({
      id: "a1", tenantId: "acme", type: "geofence_exit", severity: "high", status: "open", vehicleId: "v1", jobId: null,
      details: {}, triggeredAt: new Date(NOW.getTime() - 60 * 60_000), acknowledgedAt: null, resolvedAt: null,
      escalatedAt: null, acknowledgedBy: null, resolvedBy: null,
    });
    await repo.save(open);
    const read = repo.findOpenTriggeredBefore.bind(repo);
    repo.findOpenTriggeredBefore = async (cutoff, limit) => {
      const stale = await read(cutoff, limit);
      await repo.save(Alert.create({ ...open.toPrimitives(), status: "acknowledged", acknowledgedBy: "ops" }));
      return stale;
    };

    const service = new AlertEscalationService(repo, { fleet: { alertEscalationMinutes: 30 } } as never);

    expect(await service.escalateStale(NOW)).toBe(0);
    expect((await repo.findById("acme", "a1"))?.status).toBe("acknowledged");
  });

  it("leaves a waybill extracted between the stall read and write", async () => {
    const repo = new InMemoryWaybillRepository();
    const pending = Waybill.capture({
      id: "wb-1", tenantId: "acme", source: "upload", imageKey: "k", imageSha256: "e".repeat(64), imageBytes: 10,
      capturedAt: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
    });
    await repo.save(pending);
    const read = repo.findPendingCapturedBefore.bind(repo);
    repo.findPendingCapturedBefore = async (cutoff, limit) => {
      const stalled = await read(cutoff, limit);
      await repo.save(Waybill.create({ ...pending.toPrimitives(), status: "extracted" }));
      return stalled;
    };

    const useCase = new ExpireStalledWaybillsUseCase(repo, { fleet: { waybillExtractionStallMinutes: 15 } } as never);

    expect(await useCase.execute(NOW)).toEqual({ stalled: 0 });
    expect((await repo.findById("wb-1", "acme"))?.status).toBe("extracted");
  });
});
