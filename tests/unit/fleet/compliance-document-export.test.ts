import { describe, expect, it, vi } from "vitest";
import { ComplianceController } from "../../../apps/fleet/src/compliance.controller";
import { ComplianceDocumentsUseCase } from "../../../apps/fleet/src/compliance-documents.use-case";
import type { ComplianceReminderWindowService } from "../../../apps/fleet/src/compliance-reminder-window.service";
import type {
  ComplianceDocumentFilters,
  ComplianceDocumentRepository,
  StoredComplianceDocument,
} from "../../../apps/fleet/src/compliance-document.repository";

function doc(overrides: Partial<StoredComplianceDocument>): StoredComplianceDocument {
  return {
    id: "d1",
    tenantId: "tenant-a",
    vehicleId: "veh-1",
    documentType: "insurance",
    documentName: "Insurance",
    issueDate: "2026-01-01",
    expiryDate: "2030-01-01",
    reminderDays: 30,
    fileUrl: null,
    fileSize: null,
    notes: null,
    reminderSentAt: null,
    supersededAt: null,
    supersededById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StoredComplianceDocument;
}

function repoWith(docs: StoredComplianceDocument[]): ComplianceDocumentRepository {
  return {
    findAllByTenant: async (tenantId: string, filters?: ComplianceDocumentFilters) =>
      docs.filter(
        (d) =>
          d.tenantId === tenantId &&
          (!filters?.documentType || d.documentType === filters.documentType) &&
          (!filters?.vehicleIds || filters.vehicleIds.includes(d.vehicleId ?? "")),
      ),
  } as unknown as ComplianceDocumentRepository;
}

const window = { reminderDays: 7 } as ComplianceReminderWindowService;

describe("compliance documents export", () => {
  it("exports the rows the list filters keep", async () => {
    const useCase = new ComplianceDocumentsUseCase(
      repoWith([
        doc({ id: "valid-ins" }),
        doc({ id: "expired-ins", expiryDate: "2020-01-01" }),
        doc({ id: "roadworthy", documentType: "roadworthiness" }),
      ]),
      window,
    );

    const csv = await useCase.export("tenant-a", { documentType: "insurance", status: "valid" });

    expect(csv.split("\n")).toEqual([
      "id,vehicleId,documentType,documentName,issueDate,expiryDate,status,reminderDays",
      "valid-ins,veh-1,insurance,Insurance,2026-01-01,2030-01-01,valid,30",
    ]);
  });

  it("applies the date windows and escapes formula cells", async () => {
    const useCase = new ComplianceDocumentsUseCase(
      repoWith([
        doc({ id: "late", documentName: "=cmd|' /C calc'!A0", expiryDate: "2030-06-01" }),
        doc({ id: "early", expiryDate: "2029-01-01" }),
      ]),
      window,
    );

    const csv = await useCase.export("tenant-a", { expiringFrom: "2030-01-01" });

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=cmd|' /C calc'!A0");
  });

  it("binds the list query params on the export route and keeps owner-operator scope", async () => {
    const exportFn = vi.fn(async () => "csv");
    const vehicleRepository = { findAllByOwnerOperatorId: vi.fn(async () => [{ id: "own-1" }]) };
    const controller = new ComplianceController(
      {} as never,
      {} as never,
      { export: exportFn } as never,
      {} as never,
      vehicleRepository as never,
    );
    const res = { setHeader: vi.fn(), send: vi.fn() };
    const req = { user: { tenantId: "tenant-a", userId: "oo-1", role: "OWNER_OPERATOR" } } as never;

    await controller.exportComplianceDocuments(
      { vehicleId: "someone-else", status: "expired", search: "ins", expiringTo: "2026-12-31" },
      req,
      res,
    );

    expect(exportFn).toHaveBeenCalledWith("tenant-a", {
      vehicleId: undefined,
      vehicleIds: ["own-1"],
      documentType: undefined,
      status: "expired",
      search: "ins",
      issuedFrom: undefined,
      issuedTo: undefined,
      expiringFrom: undefined,
      expiringTo: "2026-12-31",
    });
    expect(res.send).toHaveBeenCalledWith("csv");
  });
});
