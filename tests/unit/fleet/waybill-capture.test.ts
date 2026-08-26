import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  CaptureWaybillUseCase,
  MAX_WAYBILL_IMAGE_BYTES,
} from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/capture-waybill.use-case";
import { ListWaybillsUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/list-waybills.use-case";
import { InMemoryWaybillRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-waybill.repository";
import { Waybill } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/waybill.entity";
import type { WaybillExtractionJob } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/ports/waybill-extraction.port";

const TENANT = "tenant-1";

class FakeStorage {
  readonly puts: Array<{ key: string; body: Buffer }> = [];

  async putObject(input: { key: string; body: Buffer }) {
    this.puts.push(input);
    return input.key;
  }
}

class FakeQueue {
  readonly jobs: WaybillExtractionJob[] = [];
  shouldFail = false;

  async enqueue(job: WaybillExtractionJob) {
    if (this.shouldFail) throw new Error("nats unavailable");
    this.jobs.push(job);
  }
}

let counter = 0;
const runtime = {
  generateId: () => `wb-${++counter}`,
  getDefaultTenantId: () => TENANT,
};

function harness() {
  const waybills = new InMemoryWaybillRepository();
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  return {
    waybills,
    storage,
    queue,
    capture: new CaptureWaybillUseCase(
      waybills,
      storage as never,
      queue,
      runtime as never,
    ),
    list: new ListWaybillsUseCase(waybills),
  };
}

function jpeg(bytes = 32): Buffer {
  return Buffer.alloc(bytes, 7);
}

describe("Waybill capture", () => {
  it("stores the image and records it as pending", async () => {
    const kit = harness();

    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer: jpeg(),
      contentType: "image/jpeg",
      filename: "wb.jpg",
    });

    expect(waybill.status).toBe("pending");
    expect(waybill.source).toBe("upload");
    // Nothing is known about the document until extraction runs.
    expect(waybill.waybillNumber).toBeNull();
    expect(waybill.priceKobo).toBeNull();
    expect(kit.storage.puts).toHaveLength(1);
  });

  it("hashes the bytes exactly as stored", async () => {
    const kit = harness();
    const buffer = jpeg();

    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer,
      contentType: "image/png",
      filename: "wb.png",
    });

    expect(waybill.imageSha256).toBe(createHash("sha256").update(buffer).digest("hex"));
    expect(waybill.imageBytes).toBe(buffer.byteLength);
  });

  it("puts the tenant at the front of the storage key", async () => {
    const kit = harness();

    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer: jpeg(),
      contentType: "image/jpeg",
      filename: "scan.jpg",
    });

    // Without the tenant in the key the bytes are unattributable, and the
    // storage total cannot be recomputed by prefix.
    expect(waybill.imageKey?.startsWith(`${TENANT}/waybills/`)).toBe(true);
    expect(waybill.imageKey?.endsWith("scan.jpg")).toBe(true);
  });

  it("queues extraction rather than running it inline", async () => {
    const kit = harness();

    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer: jpeg(),
      contentType: "image/jpeg",
      filename: "wb.jpg",
    });

    expect(kit.queue.jobs).toEqual([
      { waybillId: waybill.id, tenantId: TENANT, imageKey: waybill.imageKey },
    ]);
  });

  it("keeps the waybill when the queue is unreachable", async () => {
    const kit = harness();
    kit.queue.shouldFail = true;

    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer: jpeg(),
      contentType: "image/jpeg",
      filename: "wb.jpg",
    });

    // The bytes are safe and the row exists, so the capture succeeded. Losing
    // it because a broker blinked would lose the invoice behind it.
    const stored = await kit.waybills.findById(waybill.id, TENANT);
    expect(stored?.status).toBe("pending");
  });

  it("refuses anything that is not a JPG or PNG", async () => {
    const kit = harness();

    await expect(() =>
      kit.capture.execute({
        tenantId: TENANT,
        source: "upload",
        buffer: jpeg(),
        contentType: "application/pdf",
        filename: "wb.pdf",
      }),
    ).rejects.toThrow("JPG or PNG");
  });

  it("refuses an image over the size cap", async () => {
    const kit = harness();

    await expect(() =>
      kit.capture.execute({
        tenantId: TENANT,
        source: "upload",
        buffer: Buffer.alloc(MAX_WAYBILL_IMAGE_BYTES + 1),
        contentType: "image/jpeg",
        filename: "huge.jpg",
      }),
    ).rejects.toThrow("10 MB");
  });

  it("refuses an empty upload", async () => {
    const kit = harness();

    await expect(() =>
      kit.capture.execute({
        tenantId: TENANT,
        source: "upload",
        buffer: Buffer.alloc(0),
        contentType: "image/jpeg",
        filename: "empty.jpg",
      }),
    ).rejects.toThrow("required");
  });

  it("does not read another tenant's waybill", async () => {
    const kit = harness();
    const waybill = await kit.capture.execute({
      tenantId: TENANT,
      source: "upload",
      buffer: jpeg(),
      contentType: "image/jpeg",
      filename: "wb.jpg",
    });

    expect(await kit.waybills.findById(waybill.id, "tenant-2")).toBeNull();
  });
});

describe("Waybill list", () => {
  async function seed(repository: InMemoryWaybillRepository) {
    const rows: Array<Partial<Parameters<typeof Waybill.create>[0]>> = [
      { id: "w1", status: "invoiced", invoiceId: "inv-1", destination: "Abuja", customerName: "Dangote" },
      { id: "w2", status: "needs_review", destination: "Kano", customerName: "BUA" },
      { id: "w3", status: "extracted", destination: "Abuja", customerName: "Dangote" },
      { id: "w4", status: "pending", destination: "Ibadan", customerName: "Lafarge" },
    ];

    for (const row of rows) {
      await repository.save(
        Waybill.create({
          id: "x",
          tenantId: TENANT,
          source: "upload",
          status: "pending",
          waybillNumber: null,
          origin: null,
          destination: null,
          vehicleRegistration: null,
          customerName: null,
          priceKobo: null,
          pricingRuleId: null,
          weight: null,
          weightUnit: null,
          waybillDate: null,
          imageKey: null,
          imageSha256: null,
          imageBytes: null,
          extractedFields: {},
          extractionError: null,
          invoiceId: null,
          ...row,
        } as Parameters<typeof Waybill.create>[0]),
      );
    }
  }

  it("counts every waybill, not just the page", async () => {
    const repository = new InMemoryWaybillRepository();
    await seed(repository);
    const useCase = new ListWaybillsUseCase(repository);

    const result = await useCase.execute({ tenantId: TENANT, limit: 1 });

    expect(result.waybills).toHaveLength(1);
    // The figures describe the tenant's whole set. Deriving them from one page
    // would show "1 waybill" to a tenant holding four.
    expect(result.summary).toEqual({
      totalWaybills: 4,
      extracted: 1,
      needsReview: 1,
      invoiced: 1,
    });
    expect(result.page.total).toBe(4);
  });

  it("searches number, destination, vehicle and customer", async () => {
    const repository = new InMemoryWaybillRepository();
    await seed(repository);
    const useCase = new ListWaybillsUseCase(repository);

    const byDestination = await useCase.execute({ tenantId: TENANT, query: "abuja" });
    expect(byDestination.page.total).toBe(2);

    const byCustomer = await useCase.execute({ tenantId: TENANT, query: "lafarge" });
    expect(byCustomer.page.total).toBe(1);
  });

  it("filters by status", async () => {
    const repository = new InMemoryWaybillRepository();
    await seed(repository);
    const useCase = new ListWaybillsUseCase(repository);

    const result = await useCase.execute({ tenantId: TENANT, status: "needs_review" });

    expect(result.page.total).toBe(1);
    expect(result.waybills[0]?.destination).toBe("Kano");
  });
});
