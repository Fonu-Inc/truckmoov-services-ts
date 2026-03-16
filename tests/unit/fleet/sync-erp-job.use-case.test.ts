import { describe, expect, it } from "vitest";
import { SyncErpJobUseCase } from "../../../apps/fleet/src/contexts/fleet/integrations/application/sync-erp-job.use-case";
import { InMemoryJobRepository } from "../../../apps/fleet/src/contexts/fleet/jobs/infrastructure/in-memory-job.repository";

function build() {
  const repo = new InMemoryJobRepository();
  return { uc: new SyncErpJobUseCase(repo), repo };
}

describe("SyncErpJobUseCase", () => {
  it("creates a pending job on 'created' event", async () => {
    const { uc, repo } = build();
    const job = await uc.execute({ externalId: "erp-001", tenantId: "t1", status: "created", jobData: {} });
    expect(job.status).toBe("pending");
    expect(await repo.findByJobId("erp-001")).not.toBeNull();
  });

  it("updates existing job to cancelled on 'cancelled' event", async () => {
    const { uc, repo } = build();
    await uc.execute({ externalId: "erp-002", tenantId: "t1", status: "created", jobData: {} });
    const updated = await uc.execute({ externalId: "erp-002", tenantId: "t1", status: "cancelled", jobData: {} });
    expect(updated.status).toBe("cancelled");
    expect((await repo.findByJobId("erp-002"))?.status).toBe("cancelled");
  });

  it("stores tenantId on new job", async () => {
    const { uc } = build();
    const job = await uc.execute({ externalId: "erp-003", tenantId: "tenant-x", status: "created", jobData: {} });
    expect(job.tenantId).toBe("tenant-x");
  });
});
