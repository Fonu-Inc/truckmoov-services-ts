import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm, ComplianceDocumentRecord } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import type {
  ComplianceDocumentFilters,
  ComplianceDocumentRepository,
  StoredComplianceDocument,
} from "./compliance-document.repository";

@Injectable()
export class MikroComplianceDocumentRepository implements ComplianceDocumentRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(doc: StoredComplianceDocument): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(ComplianceDocumentRecord, doc as unknown as ComplianceDocumentRecord);
  }

  async findById(id: string): Promise<StoredComplianceDocument | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const rec = await em.findOne(ComplianceDocumentRecord, { id });
    return rec ? (rec as unknown as StoredComplianceDocument) : null;
  }

  async findAllByTenant(tenantId: string, filters?: ComplianceDocumentFilters): Promise<StoredComplianceDocument[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = { tenantId };
    if (filters?.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters?.documentType) where.documentType = filters.documentType;
    const records = await em.find(ComplianceDocumentRecord, where as any);
    let result = records as unknown as StoredComplianceDocument[];
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((r) =>
        r.documentName.toLowerCase().includes(q) || r.documentType.toLowerCase().includes(q),
      );
    }
    if (filters?.issueDateFrom) result = result.filter((r) => (r.issueDate ?? "") >= filters.issueDateFrom!);
    if (filters?.issueDateTo) result = result.filter((r) => (r.issueDate ?? "") <= filters.issueDateTo!);
    if (filters?.expiryDateFrom) result = result.filter((r) => (r.expiryDate ?? "") >= filters.expiryDateFrom!);
    if (filters?.expiryDateTo) result = result.filter((r) => (r.expiryDate ?? "") <= filters.expiryDateTo!);
    return result;
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(ComplianceDocumentRecord, { id });
  }
}
