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

export class ComplianceDocumentNotFoundError extends Error {}

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
  ) {}

  private withStatus(doc: StoredComplianceDocument) {
    return { ...doc, status: computeDocumentStatus(doc) };
  }

  async list(tenantId: string, filters?: ComplianceDocumentFilters & { status?: ComplianceDocumentStatus }) {
    const docs = await this.repo.findAllByTenant(tenantId, filters);
    const withStatus = docs.map((d) => this.withStatus(d));
    if (filters?.status) return withStatus.filter((d) => d.status === filters.status);
    return withStatus;
  }

  async create(tenantId: string, data: CreateComplianceDocumentInput) {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.repo.save(doc);
    return this.withStatus(doc);
  }

  async update(tenantId: string, id: string, data: Partial<Omit<StoredComplianceDocument, "id" | "tenantId" | "createdAt">>) {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing || existing.tenantId !== tenantId) throw new ComplianceDocumentNotFoundError();
    const updated = { ...existing, ...data, updatedAt: new Date() };
    await this.repo.save(updated);
    return this.withStatus(updated);
  }

  async delete(tenantId: string, id: string) {
    const doc = await this.repo.findById(id, tenantId);
    if (!doc || doc.tenantId !== tenantId) throw new ComplianceDocumentNotFoundError();
    await this.repo.deleteById(id, tenantId);
  }

  async summary(tenantId: string) {
    const docs = await this.repo.findAllByTenant(tenantId);
    const withStatus = docs.map((d) => this.withStatus(d));
    const valid = withStatus.filter((d) => d.status === "valid").length;
    const expiring = withStatus.filter((d) => d.status === "expiring").length;
    const expired = withStatus.filter((d) => d.status === "expired").length;
    const complianceRate = docs.length > 0 ? Math.round((valid / docs.length) * 100) : 100;
    return { total: docs.length, valid, expiringSoon: expiring, expired, complianceRatePercent: complianceRate };
  }

  async updateReminder(tenantId: string, id: string, reminderDays: number) {
    return this.update(tenantId, id, { reminderDays });
  }

  async renew(tenantId: string, id: string, data: { expiryDate?: string; fileUrl?: string; fileSize?: number }) {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing || existing.tenantId !== tenantId) throw new ComplianceDocumentNotFoundError();
    const newExpiry = data.expiryDate ?? (() => {
      if (!existing.expiryDate) return null;
      const d = new Date(existing.expiryDate);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const updated: StoredComplianceDocument = {
      ...existing,
      expiryDate: newExpiry,
      fileUrl: data.fileUrl ?? existing.fileUrl,
      fileSize: data.fileSize ?? existing.fileSize,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    return this.withStatus(updated);
  }

  async setFileUrl(tenantId: string, id: string, fileUrl: string, fileSize: number | null) {
    return this.update(tenantId, id, { fileUrl, fileSize });
  }

  async export(tenantId: string): Promise<string> {
    const docs = await this.repo.findAllByTenant(tenantId);
    const headers = ["id", "vehicleId", "documentType", "documentName", "issueDate", "expiryDate", "status", "reminderDays"];
    const rows = [
      headers.join(","),
      ...docs.map((d) => {
        const status = computeDocumentStatus(d);
        return headers.map((h) => JSON.stringify(h === "status" ? status : (d as Record<string, unknown>)[h] ?? "")).join(",");
      }),
    ];
    return rows.join("\n");
  }
}
