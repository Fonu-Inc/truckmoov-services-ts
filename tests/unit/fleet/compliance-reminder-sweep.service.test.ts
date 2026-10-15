import { describe, expect, it, beforeEach, vi } from "vitest";
import { ComplianceReminderSweepService } from "../../../apps/fleet/src/compliance-reminder-sweep.service";
import { ComplianceReminderWindowService } from "../../../apps/fleet/src/compliance-reminder-window.service";
import type {
  ComplianceDocumentRepository,
  StoredComplianceDocument,
} from "../../../apps/fleet/src/compliance-document.repository";

function dateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildDoc(overrides: Partial<StoredComplianceDocument> = {}): StoredComplianceDocument {
  return {
    id: "doc-1",
    tenantId: "tenant-a",
    vehicleId: "veh-1",
    documentType: "insurance",
    documentName: "Insurance 2026",
    issueDate: null,
    expiryDate: dateIn(3),
    reminderDays: 30,
    fileUrl: null,
    fileSize: null,
    notes: null,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class FakeRepo implements ComplianceDocumentRepository {
  reminded: Array<{ ids: string[]; sentAt: Date }> = [];
  constructor(private docs: StoredComplianceDocument[]) {}

  async findDueForReminder(onOrBefore: string): Promise<StoredComplianceDocument[]> {
    return this.docs.filter(
      (d) => d.expiryDate !== null && d.expiryDate <= onOrBefore && d.reminderSentAt === null,
    );
  }
  async markReminded(ids: string[], sentAt: Date): Promise<void> {
    this.reminded.push({ ids, sentAt });
    for (const doc of this.docs) if (ids.includes(doc.id)) doc.reminderSentAt = sentAt;
  }
  async save(): Promise<void> {}
  async findById(): Promise<StoredComplianceDocument | null> {
    return null;
  }
  async findAllByTenant(): Promise<StoredComplianceDocument[]> {
    return [];
  }
  async deleteById(): Promise<void> {}
}

function windowOf(days: number): ComplianceReminderWindowService {
  return { reminderDays: days } as ComplianceReminderWindowService;
}

describe("ComplianceReminderSweepService", () => {
  let bus: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bus = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function build(docs: StoredComplianceDocument[], days = 7) {
    const repo = new FakeRepo(docs);
    const service = new ComplianceReminderSweepService(repo, windowOf(days), bus as never, {
      persistence: { backend: "in-memory" },
    } as never);
    return { repo, service };
  }

  it("publishes one event per tenant, not one per document", async () => {
    const { service } = build([
      buildDoc({ id: "a1", tenantId: "tenant-a", expiryDate: dateIn(2) }),
      buildDoc({ id: "a2", tenantId: "tenant-a", expiryDate: dateIn(5) }),
      buildDoc({ id: "b1", tenantId: "tenant-b", expiryDate: dateIn(1) }),
    ]);

    const result = await service.run();

    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ tenants: 2, documents: 3 });
  });

  it("puts every document for a tenant in that tenant's digest", async () => {
    const { service } = build([
      buildDoc({ id: "a1", tenantId: "tenant-a", expiryDate: dateIn(2) }),
      buildDoc({ id: "a2", tenantId: "tenant-a", expiryDate: dateIn(5) }),
    ]);

    await service.run();

    const [subject, envelope] = bus.publish.mock.calls[0];
    expect(subject).toBe("tm.tenant-a.compliance.documents.expiring");
    expect(envelope.data.documents.map((d: { id: string }) => d.id)).toEqual(["a1", "a2"]);
    expect(envelope.data.audience).toBe("all_active_tenant_users");
    expect(envelope.data.reminder_window_days).toBe(7);
  });

  it("does not announce the same document twice", async () => {
    const { service } = build([buildDoc({ id: "a1", expiryDate: dateIn(2) })]);

    const first = await service.run();
    const second = await service.run();

    expect(first.documents).toBe(1);
    expect(second.documents).toBe(0);
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it("ignores documents outside the window", async () => {
    const { service } = build([buildDoc({ id: "far", expiryDate: dateIn(30) })], 7);

    const result = await service.run();

    expect(result.documents).toBe(0);
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("honours a widened window", async () => {
    const { service } = build([buildDoc({ id: "far", expiryDate: dateIn(30) })], 45);

    const result = await service.run();

    expect(result.documents).toBe(1);
  });

  it("flags an already-expired document", async () => {
    const { service } = build([buildDoc({ id: "gone", expiryDate: dateIn(-4) })]);

    await service.run();

    const [, envelope] = bus.publish.mock.calls[0];
    expect(envelope.data.documents[0].already_expired).toBe(true);
  });

  it("leaves documents unstamped when publishing fails, so the next sweep retries", async () => {
    bus.publish.mockRejectedValue(new Error("nats down"));
    const { repo, service } = build([buildDoc({ id: "a1", expiryDate: dateIn(2) })]);

    const result = await service.run();

    expect(result.documents).toBe(0);
    expect(repo.reminded).toHaveLength(0);
  });

  it("skips documents with no expiry date", async () => {
    const { service } = build([buildDoc({ id: "none", expiryDate: null })]);

    const result = await service.run();

    expect(result.documents).toBe(0);
  });
});
