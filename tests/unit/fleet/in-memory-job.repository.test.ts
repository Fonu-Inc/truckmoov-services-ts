import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryJobRepository } from "../../../apps/fleet/src/contexts/fleet/jobs/infrastructure/in-memory-job.repository";
import { Job } from "../../../apps/fleet/src/contexts/fleet/jobs/domain/entities/job.entity";

function makeJob(jobId: string, tenantId = "t1", status = "pending") {
  return Job.create({ jobId, tenantId, status, updatedAt: new Date().toISOString() });
}

describe("InMemoryJobRepository", () => {
  let repo: InMemoryJobRepository;
  beforeEach(() => { repo = new InMemoryJobRepository(); });

  it("saves and finds by jobId", async () => {
    const j = makeJob("job-1");
    await repo.save(j);
    expect(await repo.findByJobId("job-1")).toBe(j);
  });

  it("returns null for missing jobId", async () => {
    expect(await repo.findByJobId("missing")).toBeNull();
  });

  it("findAll filters by tenantId", async () => {
    await repo.save(makeJob("j1", "t1"));
    await repo.save(makeJob("j2", "t2"));
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
  });

  it("findAll filters by status", async () => {
    await repo.save(makeJob("j1", "t1", "pending"));
    await repo.save(makeJob("j2", "t1", "delivered"));
    expect(await repo.findAll({ status: "delivered" })).toHaveLength(1);
  });

  it("findAll search matches jobId", async () => {
    await repo.save(makeJob("order-abc", "t1"));
    await repo.save(makeJob("order-xyz", "t1"));
    expect(await repo.findAll({ query: "abc" })).toHaveLength(1);
  });

  it("save overwrites existing job", async () => {
    await repo.save(makeJob("j1"));
    await repo.save(makeJob("j1").updateStatus("assigned"));
    expect((await repo.findByJobId("j1"))?.status).toBe("assigned");
  });
});
