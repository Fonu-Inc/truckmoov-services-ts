import { describe, expect, it, beforeEach } from "vitest";
import { ComplianceDocumentsUseCase } from "../../../apps/fleet/src/compliance-documents.use-case";
import type { ComplianceReminderWindowService } from "../../../apps/fleet/src/compliance-reminder-window.service";
import type {
  ComplianceDocumentFilters,
  ComplianceDocumentRepository,
  StoredComplianceDocument,
} from "../../../apps/fleet/src/compliance-document.repository";

class FakeRepo implements ComplianceDocumentRepository {
  docs = new Map<string, StoredComplianceDocument>();

  async save(doc: StoredComplianceDocument): Promise<void> {
    this.docs.set(doc.id, { ...doc });
  }
  async findById(id: string, tenantId: string): Promise<StoredComplianceDocument | null> {
    const doc = this.docs.get(id);
    return doc && doc.tenantId === tenantId ? { ...doc } : null;
  }
  async findAllByTenant(
    tenantId: string,
    filters?: ComplianceDocumentFilters,
  ): Promise<StoredComplianceDocument[]> {
    return [...this.docs.values()].filter((doc) => {
      if (doc.tenantId !== tenantId) return false;
      if (!filters?.includeSuperseded && doc.supersededAt !== null) return false;
      if (filters?.vehicleId && doc.vehicleId !== filters.vehicleId) return false;
      return true;
    });
  }
  async deleteById(id: string): Promise<void> {
    this.docs.delete(id);
  }
  async findDueForReminder(onOrBefore: string): Promise<StoredComplianceDocument[]> {
    return [...this.docs.values()].filter(
      (d) =>
        d.expiryDate !== null &&
        d.expiryDate <= onOrBefore &&
        d.reminderSentAt === null &&
        d.supersededAt === null,
    );
  }
  async markReminded(ids: string[], sentAt: Date): Promise<void> {
    for (const doc of this.docs.values()) if (ids.includes(doc.id)) doc.reminderSentAt = sentAt;
  }
}

const window = { reminderDays: 7 } as ComplianceReminderWindowService;

describe("Compliance document renewal", () => {
  let repo: FakeRepo;
  let useCase: ComplianceDocumentsUseCase;

  beforeEach(async () => {
    repo = new FakeRepo();
    useCase = new ComplianceDocumentsUseCase(repo, window);
  });

  async function seed() {
    return useCase.create("tenant-a", {
      documentType: "insurance",
      documentName: "Insurance 2025",
      vehicleId: "veh-1",
      expiryDate: "2026-09-01",
      fileUrl: "s3://old-scan.pdf",
    });
  }

  it("keeps the old document instead of overwriting it", async () => {
    const original = await seed();

    await useCase.renew("tenant-a", original.id, {
      expiryDate: "2027-09-01",
      fileUrl: "s3://new-scan.pdf",
    });

    const kept = await repo.findById(original.id, "tenant-a");
    expect(kept).not.toBeNull();
    expect(kept?.expiryDate).toBe("2026-09-01");
    expect(kept?.fileUrl).toBe("s3://old-scan.pdf");
  });

  it("creates the replacement under a new id", async () => {
    const original = await seed();

    const renewed = await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    expect(renewed.id).not.toBe(original.id);
    expect(renewed.expiryDate).toBe("2027-09-01");
    expect(renewed.supersededAt).toBeNull();
  });

  it("links the old record to the one that replaced it", async () => {
    const original = await seed();

    const renewed = await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    const kept = await repo.findById(original.id, "tenant-a");
    expect(kept?.supersededAt).toBeInstanceOf(Date);
    expect(kept?.supersededById).toBe(renewed.id);
  });

  it("hides the superseded record from the normal list", async () => {
    const original = await seed();
    await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    const listed = await useCase.list("tenant-a");

    expect(listed).toHaveLength(1);
    expect(listed[0]?.expiryDate).toBe("2027-09-01");
  });

  it("returns the whole chain from history", async () => {
    const original = await seed();
    await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    const chain = await useCase.history("tenant-a");

    expect(chain).toHaveLength(2);
    expect(chain.map((d) => d.expiryDate).sort()).toEqual(["2026-09-01", "2027-09-01"]);
  });

  it("counts only the current document in the summary", async () => {
    const original = await seed();
    await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    const summary = await useCase.summary("tenant-a");

    expect(summary.total).toBe(1);
  });

  it("never reminds on a superseded document", async () => {
    const original = await seed();
    await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    const due = await repo.findDueForReminder("2030-01-01");

    expect(due).toHaveLength(1);
    expect(due[0]?.expiryDate).toBe("2027-09-01");
  });

  it("arms the reminder on the replacement", async () => {
    const original = await seed();

    const renewed = await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });

    expect(renewed.reminderSentAt).toBeNull();
  });

  it("defaults the new expiry to one year on from the old one", async () => {
    const original = await seed();

    const renewed = await useCase.renew("tenant-a", original.id, {});

    expect(renewed.expiryDate).toBe("2027-09-01");
  });

  it("refuses to renew another tenant's document", async () => {
    const original = await seed();

    await expect(useCase.renew("tenant-b", original.id, {})).rejects.toThrow();
    expect((await repo.findById(original.id, "tenant-a"))?.supersededAt).toBeNull();
  });

  it("supports renewing twice, keeping both older records", async () => {
    const original = await seed();
    const second = await useCase.renew("tenant-a", original.id, { expiryDate: "2027-09-01" });
    await useCase.renew("tenant-a", second.id, { expiryDate: "2028-09-01" });

    expect(await useCase.list("tenant-a")).toHaveLength(1);
    expect(await useCase.history("tenant-a")).toHaveLength(3);
  });
});
