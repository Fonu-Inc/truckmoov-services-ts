import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  COMPLIANCE_DOCUMENT_REPOSITORY,
  type ComplianceDocumentFilters,
  type ComplianceDocumentRepository,
  type ComplianceDocumentStatus,
  type StoredComplianceDocument,
  computeDocumentStatus,
} from "./compliance-document.repository";
import { ComplianceReminderWindowService } from "./compliance-reminder-window.service";
import { csvCell } from "./utils/csv";

export class ComplianceDocumentNotFoundError extends Error {}

type OwnedVehicles = ReadonlySet<string> | null;

function assertVehicleOwned(vehicleId: string | null | undefined, owned: OwnedVehicles): void {
  if (owned === null) return;
  if (!vehicleId || !owned.has(vehicleId)) throw new ComplianceDocumentNotFoundError();
}

export type ComplianceDocumentListFilters = ComplianceDocumentFilters & {
  status?: ComplianceDocumentStatus;
  issuedFrom?: string;
  issuedTo?: string;
  expiringFrom?: string;
  expiringTo?: string;
};

const EXPORT_HEADERS = ["id", "vehicleId", "documentType", "documentName", "issueDate", "expiryDate", "status", "reminderDays"] as const;

export type CreateComplianceDocumentInput = {
  documentType: string;
  documentName: string;
  vehicleId?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  reminderDays?: number;
  fileUrl?: string | null;
  fileSize?: number | null;
  notes?: string | null;
};

@Injectable()
export class ComplianceDocumentsUseCase {
  constructor(
    @Inject(COMPLIANCE_DOCUMENT_REPOSITORY)
    private readonly repo: ComplianceDocumentRepository,
    @Inject(ComplianceReminderWindowService)
    private readonly reminderWindow: ComplianceReminderWindowService,
  ) {}

  private async findOwned(tenantId: string, id: string, owned: OwnedVehicles): Promise<StoredComplianceDocument> {
    const doc = await this.repo.findById(id, tenantId);
    if (!doc || doc.tenantId !== tenantId) throw new ComplianceDocumentNotFoundError();
    assertVehicleOwned(doc.vehicleId, owned);
    return doc;
  }

  private withStatus(doc: StoredComplianceDocument) {
    return { ...doc, status: computeDocumentStatus(doc, this.reminderWindow.reminderDays) };
  }

  async list(tenantId: string, filters?: ComplianceDocumentListFilters) {
    const docs = await this.repo.findAllByTenant(tenantId, filters);
    let withStatus = docs.map((d) => this.withStatus(d));
    if (filters?.status) withStatus = withStatus.filter((d) => d.status === filters.status);

    // Date windows are applied here rather than in SQL because the repository
    // filter is shared with the reminder sweep, which has no use for them.
    withStatus = withStatus.filter(
      (d) =>
        withinWindow(d.issueDate, filters?.issuedFrom, filters?.issuedTo) &&
        withinWindow(d.expiryDate, filters?.expiringFrom, filters?.expiringTo),
    );
    return withStatus;
  }

  async create(tenantId: string, data: CreateComplianceDocumentInput, owned: OwnedVehicles = null) {
    assertVehicleOwned(data.vehicleId, owned);
    const doc: StoredComplianceDocument = {
      id: randomUUID(),
      tenantId,
      vehicleId: data.vehicleId ?? null,
      documentType: data.documentType,
      documentName: data.documentName,
      issueDate: data.issueDate ?? null,
      expiryDate: data.expiryDate ?? null,
      reminderDays: data.reminderDays ?? 30,
      fileUrl: data.fileUrl ?? null,
      fileSize: data.fileSize ?? null,
      notes: data.notes ?? null,
      reminderSentAt: null,
      supersededAt: null,
      supersededById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.repo.save(doc);
    return this.withStatus(doc);
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<Omit<StoredComplianceDocument, "id" | "tenantId" | "createdAt">>,
    owned: OwnedVehicles = null,
  ) {
    const existing = await this.findOwned(tenantId, id, owned);
    if (data.vehicleId !== undefined) assertVehicleOwned(data.vehicleId, owned);
    const updated = { ...existing, ...data, updatedAt: new Date() };
    // A new expiry re-arms the reminder, otherwise a renewed document would
    // never be announced again.
    if (updated.expiryDate !== existing.expiryDate) updated.reminderSentAt = null;
    await this.repo.save(updated);
    return this.withStatus(updated);
  }

  /** The full chain for a vehicle, superseded records included, for audit. */
  async history(tenantId: string, filters?: ComplianceDocumentFilters) {
    const docs = await this.repo.findAllByTenant(tenantId, {
      ...filters,
      includeSuperseded: true,
    });
    return docs.map((d) => this.withStatus(d));
  }

  async delete(tenantId: string, id: string, owned: OwnedVehicles = null) {
    await this.findOwned(tenantId, id, owned);
    await this.repo.deleteById(id, tenantId);
  }

  async summary(tenantId: string, filters?: { vehicleIds?: string[] }) {
    const docs = await this.repo.findAllByTenant(tenantId, filters);
    const withStatus = docs.map((d) => this.withStatus(d));
    const valid = withStatus.filter((d) => d.status === "valid").length;
    const expiring = withStatus.filter((d) => d.status === "expiring").length;
    const expired = withStatus.filter((d) => d.status === "expired").length;
    const complianceRate = docs.length > 0 ? Math.round((valid / docs.length) * 100) : 100;
    return { total: docs.length, valid, expiringSoon: expiring, expired, complianceRatePercent: complianceRate };
  }

  async updateReminder(tenantId: string, id: string, reminderDays: number, owned: OwnedVehicles = null) {
    return this.update(tenantId, id, { reminderDays }, owned);
  }

  async renew(
    tenantId: string,
    id: string,
    data: { expiryDate?: string; fileUrl?: string; fileSize?: number },
    owned: OwnedVehicles = null,
  ) {
    const existing = await this.findOwned(tenantId, id, owned);
    const newExpiry = data.expiryDate ?? (() => {
      if (!existing.expiryDate) return null;
      const d = new Date(existing.expiryDate);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })();
    // A renewal supersedes rather than overwrites. Proving a vehicle was
    // covered on the date of an incident needs the document that was in force
    // then, not only the one in force now.
    const now = new Date();
    const replacement: StoredComplianceDocument = {
      ...existing,
      id: randomUUID(),
      expiryDate: newExpiry,
      fileUrl: data.fileUrl ?? existing.fileUrl,
      fileSize: data.fileSize ?? existing.fileSize,
      reminderSentAt: null,
      supersededAt: null,
      supersededById: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(replacement);

    await this.repo.save({
      ...existing,
      supersededAt: now,
      supersededById: replacement.id,
      updatedAt: now,
    });

    return this.withStatus(replacement);
  }

  async setFileUrl(tenantId: string, id: string, fileUrl: string, fileSize: number | null, owned: OwnedVehicles = null) {
    return this.update(tenantId, id, { fileUrl, fileSize }, owned);
  }

  async export(tenantId: string, filters?: ComplianceDocumentListFilters): Promise<string> {
    const docs = await this.list(tenantId, filters);
    const rows = docs.map((doc) => EXPORT_HEADERS.map((header) => csvCell(doc[header])).join(","));
    return [EXPORT_HEADERS.join(","), ...rows].join("\n");
  }
}

function withinWindow(value: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return false;
  if (from && at < Date.parse(from)) return false;
  if (to && at > Date.parse(to)) return false;
  return true;
}
