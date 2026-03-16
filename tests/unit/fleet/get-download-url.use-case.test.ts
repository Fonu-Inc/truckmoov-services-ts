import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { GetDownloadUrlUseCase } from "../../../apps/fleet/src/contexts/fleet/documents/application/get-download-url.use-case";
import { InMemoryDocumentRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-document.repository";
import { InMemoryAccessLogRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-access-log.repository";
import { Document } from "../../../apps/fleet/src/contexts/fleet/documents/domain/document.entity";

function makeDoc(id: string, tenantId = "t1") {
  return Document.create({ id, tenantId, entityType: "job", entityId: "job-1", docType: "pod", key: `${tenantId}/job/job-1/pod/${id}.pdf`, filename: "file.pdf", contentType: "application/pdf", sizeBytes: 512, uploadedBy: "user-1", uploadedAt: new Date(), expiresAt: null });
}

function makeUseCase() {
  const docRepo = new InMemoryDocumentRepository();
  const logRepo = new InMemoryAccessLogRepository();
  const storage = { createPresignedDownloadUrl: vi.fn().mockResolvedValue("https://storage.example.com/signed"), putObject: vi.fn(), createPresignedUploadUrl: vi.fn() };
  return { uc: new GetDownloadUrlUseCase(docRepo, logRepo, storage as any), docRepo, logRepo, storage };
}

describe("GetDownloadUrlUseCase", () => {
  it("returns presigned url for existing document", async () => {
    const { uc, docRepo } = makeUseCase();
    await docRepo.save(makeDoc("doc-1"));
    const result = await uc.execute("t1", "doc-1", "user-1", "1.2.3.4");
    expect(result.url).toBe("https://storage.example.com/signed");
    expect(result.expiresIn).toBe(900);
  });

  it("throws NotFoundException for missing document", async () => {
    const { uc } = makeUseCase();
    await expect(uc.execute("t1", "missing", "user-1", "1.2.3.4")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for wrong tenant", async () => {
    const { uc, docRepo } = makeUseCase();
    await docRepo.save(makeDoc("doc-1", "t1"));
    await expect(uc.execute("t2", "doc-1", "user-1", "1.2.3.4")).rejects.toThrow(NotFoundException);
  });

  it("logs download access entry", async () => {
    const { uc, docRepo, logRepo } = makeUseCase();
    await docRepo.save(makeDoc("doc-1"));
    await uc.execute("t1", "doc-1", "user-1", "1.2.3.4");
    const logs = await logRepo.findByDocId("doc-1", "t1");
    expect(logs[0].action).toBe("download");
    expect(logs[0].ip).toBe("1.2.3.4");
  });
});
