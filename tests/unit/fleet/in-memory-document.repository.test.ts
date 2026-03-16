import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryDocumentRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-document.repository";
import { Document } from "../../../apps/fleet/src/contexts/fleet/documents/domain/document.entity";

function makeDoc(id: string, tenantId = "t1", overrides: Partial<Parameters<typeof Document.create>[0]> = {}) {
  return Document.create({ id, tenantId, entityType: "job", entityId: "job-1", docType: "pod", key: `${tenantId}/job/job-1/pod/${id}.pdf`, filename: "file.pdf", contentType: "application/pdf", sizeBytes: 1024, uploadedBy: "user-1", uploadedAt: new Date(), expiresAt: null, ...overrides });
}

describe("InMemoryDocumentRepository", () => {
  let repo: InMemoryDocumentRepository;
  beforeEach(() => { repo = new InMemoryDocumentRepository(); });

  it("saves and finds by id with tenant check", async () => {
    await repo.save(makeDoc("doc-1"));
    expect(await repo.findById("doc-1", "t1")).not.toBeNull();
    expect(await repo.findById("doc-1", "t2")).toBeNull();
  });

  it("returns null for missing id", async () => {
    expect(await repo.findById("missing", "t1")).toBeNull();
  });

  it("findByEntity filters correctly", async () => {
    await repo.save(makeDoc("d1", "t1", { entityType: "job", entityId: "job-1" }));
    await repo.save(makeDoc("d2", "t1", { entityType: "job", entityId: "job-2" }));
    await repo.save(makeDoc("d3", "t2", { entityType: "job", entityId: "job-1" }));
    const result = await repo.findByEntity("t1", "job", "job-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
  });
});
