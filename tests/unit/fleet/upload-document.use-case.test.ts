import { describe, expect, it, vi } from "vitest";
import { type AppConfigService } from "@shared/config";
import { UploadDocumentUseCase, type UploadDocumentCommand } from "../../../apps/fleet/src/contexts/fleet/documents/application/upload-document.use-case";
import { InMemoryDocumentRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-document.repository";
import { InMemoryAccessLogRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-access-log.repository";

/** Reports nothing; storage accounting is tested separately. */
const storageReporter = {
  recordUpload: async () => {},
  recordDeletion: async () => {},
} as never;

function makeUseCase(retentionDays = 365) {
  const config = { fleet: { documentRetentionDays: retentionDays, documentMaxBytes: 10 * 1024 * 1024, documentScanRequired: false } } as AppConfigService;
  const docRepo = new InMemoryDocumentRepository();
  const logRepo = new InMemoryAccessLogRepository();
  const storage = { putObject: vi.fn().mockResolvedValue(undefined), createPresignedDownloadUrl: vi.fn(), createPresignedUploadUrl: vi.fn() };
  return { uc: new UploadDocumentUseCase(docRepo, logRepo, storage as any, config, { scan: async () => ({ scanned: false, clean: false }) }, storageReporter), docRepo, logRepo, storage };
}

const baseCmd: UploadDocumentCommand = {
  tenantId: "t1", entityType: "job", entityId: "job-1", docType: "pod",
  filename: "delivery.pdf", contentType: "application/pdf", buffer: Buffer.from("test"), uploadedBy: "user-1",
};

describe("UploadDocumentUseCase", () => {
  it("uploads and returns document", async () => {
    const { uc, storage } = makeUseCase();
    const doc = await uc.execute(baseCmd);
    expect(doc.tenantId).toBe("t1");
    expect(storage.putObject).toHaveBeenCalledOnce();
  });

  it("builds storage key with correct path structure", async () => {
    const { uc, storage } = makeUseCase();
    await uc.execute(baseCmd);
    const key: string = storage.putObject.mock.calls[0][0].key;
    expect(key).toMatch(/^t1\/job\/job-1\/pod\/.+-delivery\.pdf$/);
  });

  it("persists document in repository", async () => {
    const { uc, docRepo } = makeUseCase();
    const doc = await uc.execute(baseCmd);
    expect(await docRepo.findById(doc.id, "t1")).not.toBeNull();
  });

  it("logs upload access entry", async () => {
    const { uc, logRepo } = makeUseCase();
    const doc = await uc.execute(baseCmd);
    const logs = await logRepo.findByDocId(doc.id, "t1");
    expect(logs[0].action).toBe("upload");
  });

  it("sets expiresAt based on retention days", async () => {
    const { uc } = makeUseCase(30);
    const doc = await uc.execute(baseCmd);
    const diffDays = Math.round((doc.expiresAt!.getTime() - Date.now()) / 86400000);
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it("releases the reserved bytes when the write to storage fails", async () => {
    const reporter = { recordUpload: vi.fn(async () => {}), recordDeletion: vi.fn(async () => {}) };
    const config = { fleet: { documentRetentionDays: 30, documentMaxBytes: 1024, documentScanRequired: false } } as AppConfigService;
    const storage = { putObject: vi.fn().mockRejectedValue(new Error("s3 down")) };
    const uc = new UploadDocumentUseCase(
      new InMemoryDocumentRepository(),
      new InMemoryAccessLogRepository(),
      storage as never,
      config,
      { scan: async () => ({ scanned: false, clean: false }) },
      reporter as never,
    );

    await expect(uc.execute(baseCmd)).rejects.toThrow("s3 down");
    expect(reporter.recordDeletion).toHaveBeenCalledWith("t1", baseCmd.buffer.byteLength);
  });
});
