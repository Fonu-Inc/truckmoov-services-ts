export type ComplianceDocumentStatus = "valid" | "expiring" | "expired";

export type StoredComplianceDocument = {
  id: string;
  tenantId: string;
  vehicleId: string | null;
  documentType: string;
  documentName: string;
  issueDate: string | null;
  expiryDate: string | null;
  reminderDays: number;
  fileUrl: string | null;
  fileSize: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplianceDocumentFilters = {
  vehicleId?: string;
  documentType?: string;
  status?: ComplianceDocumentStatus;
  search?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  expiryDateFrom?: string;
  expiryDateTo?: string;
};

export interface ComplianceDocumentRepository {
  save(doc: StoredComplianceDocument): Promise<void>;
  findById(id: string, tenantId: string): Promise<StoredComplianceDocument | null>;
  findAllByTenant(tenantId: string, filters?: ComplianceDocumentFilters): Promise<StoredComplianceDocument[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
}

export const COMPLIANCE_DOCUMENT_REPOSITORY = Symbol("COMPLIANCE_DOCUMENT_REPOSITORY");

export function computeDocumentStatus(doc: StoredComplianceDocument): ComplianceDocumentStatus {
  if (!doc.expiryDate) return "valid";
  const today = new Date().toISOString().slice(0, 10);
  if (doc.expiryDate < today) return "expired";
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + doc.reminderDays);
  const soonStr = soonDate.toISOString().slice(0, 10);
  if (doc.expiryDate <= soonStr) return "expiring";
  return "valid";
}
