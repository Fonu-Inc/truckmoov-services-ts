import { describe, expect, it, vi } from "vitest";
import { type AppConfigService } from "@shared/config";
import { UploadDocumentUseCase, type UploadDocumentCommand } from "../../../apps/fleet/src/contexts/fleet/documents/application/upload-document.use-case";
import { InMemoryDocumentRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-document.repository";
import { InMemoryAccessLogRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-access-log.repository";

function makeUseCase(retentionDays = 365) {
  const config = { fleet: { documentRetentionDays: retentionDays } } as AppConfigService;
  const docRepo = new InMemoryDocumentRepository();
  const logRepo = new InMemoryAccessLogRepository();
  const storage = { putObject: vi.fn().mockResolvedValue(undefined), createPresignedDownloadUrl: vi.fn(), createPresignedUploadUrl: vi.fn() };
  return { uc: new UploadDocumentUseCase(docRepo, logRepo, storage as any, config), docRepo, logRepo, storage };
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
});
