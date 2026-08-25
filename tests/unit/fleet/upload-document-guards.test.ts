import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  UploadDocumentUseCase,
  DocumentTooLargeError,
  DocumentTypeNotAllowedError,
  DocumentRejectedByScannerError,
} from "../../../apps/fleet/src/contexts/fleet/documents/application/upload-document.use-case";
import { InMemoryDocumentRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-document.repository";
import { InMemoryAccessLogRepository } from "../../../apps/fleet/src/contexts/fleet/documents/infrastructure/in-memory-access-log.repository";
import type { FileScanner, FileScanVerdict } from "../../../apps/fleet/src/contexts/fleet/documents/domain/file-scanner.port";

/**
 * Reports nothing. Storage accounting has its own tests; these exercise the
 * upload guards around it.
 */
const storageReporter = {
  recordUpload: async () => {},
  recordDeletion: async () => {},
} as never;

function config(maxBytes = 1024, scanRequired = false) {
  return { fleet: { documentRetentionDays: 365, documentMaxBytes: maxBytes, documentScanRequired: scanRequired } };
}

function scannerOf(verdict: FileScanVerdict): FileScanner {
  return { scan: vi.fn().mockResolvedValue(verdict) };
}

const unscanned: FileScanVerdict = { scanned: false, clean: false, reason: "no scanner configured" };

function command(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    entityType: "vehicle" as const,
    entityId: "veh-1",
    docType: "permit" as const,
    filename: "permit.pdf",
    contentType: "application/pdf",
    buffer: Buffer.alloc(100),
    uploadedBy: "user-1",
    ...overrides,
  };
}

describe("UploadDocumentUseCase guards", () => {
  let docs: InMemoryDocumentRepository;
  let logs: InMemoryAccessLogRepository;
  let storage: { putObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    docs = new InMemoryDocumentRepository();
    logs = new InMemoryAccessLogRepository();
    storage = { putObject: vi.fn().mockResolvedValue(undefined) };
  });

  function build(cfg = config(), scanner: FileScanner = scannerOf(unscanned)) {
    return new UploadDocumentUseCase(docs, logs, storage as never, cfg as never, scanner, storageReporter);
  }

  it("stores an allowed file under the cap", async () => {
    const doc = await build().execute(command());

    expect(doc.sizeBytes).toBe(100);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("refuses a file over the cap", async () => {
    await expect(
      build(config(50)).execute(command({ buffer: Buffer.alloc(51) })),
    ).rejects.toBeInstanceOf(DocumentTooLargeError);
  });

  it("never reaches storage when the file is too large", async () => {
    await expect(
      build(config(50)).execute(command({ buffer: Buffer.alloc(51) })),
    ).rejects.toThrow();

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(await docs.findByEntity("tenant-a", "vehicle", "veh-1")).toHaveLength(0);
  });

  it("refuses a content type outside the allowlist", async () => {
    await expect(
      build().execute(command({ contentType: "application/x-msdownload", filename: "x.exe" })),
    ).rejects.toBeInstanceOf(DocumentTypeNotAllowedError);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("accepts images as well as PDF", async () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      await build().execute(command({ contentType }));
    }
    expect(storage.putObject).toHaveBeenCalledTimes(3);
  });

  it("ignores charset parameters on the content type", async () => {
    await build().execute(command({ contentType: "application/pdf; charset=binary" }));
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("refuses a file the scanner flagged", async () => {
    const scanner = scannerOf({ scanned: true, clean: false, reason: "EICAR test signature" });

    await expect(build(config(), scanner).execute(command())).rejects.toBeInstanceOf(
      DocumentRejectedByScannerError,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("stores a file the scanner cleared", async () => {
    const scanner = scannerOf({ scanned: true, clean: true });

    await build(config(), scanner).execute(command());

    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("allows an unscanned file when scanning is not required", async () => {
    await build(config(1024, false)).execute(command());
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("refuses an unscanned file when scanning is required", async () => {
    await expect(build(config(1024, true)).execute(command())).rejects.toBeInstanceOf(
      DocumentRejectedByScannerError,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("writes no access-log entry for a refused upload", async () => {
    await expect(
      build(config(10)).execute(command({ buffer: Buffer.alloc(11) })),
    ).rejects.toThrow();

    expect(await logs.findByDocId("any", "tenant-a")).toHaveLength(0);
  });
});
