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
  reminderSentAt: Date | null;
  supersededAt: Date | null;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplianceDocumentFilters = {
  vehicleId?: string;
  /**
   * The vehicle set an owner-operator is allowed to see. When present,
   * results are restricted to these ids regardless of `vehicleId` — set by
   * the controller from the caller's own identity, never from a request param.
   */
  vehicleIds?: string[];
  documentType?: string;
  status?: ComplianceDocumentStatus;
  search?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  expiryDateFrom?: string;
  expiryDateTo?: string;
  /**
   * Superseded documents are hidden unless asked for. A renewal keeps the old
   * record so it can be produced later, but it is history, not current state.
   */
  includeSuperseded?: boolean;
};

export interface ComplianceDocumentRepository {
  save(doc: StoredComplianceDocument): Promise<void>;
  findById(id: string, tenantId: string): Promise<StoredComplianceDocument | null>;
  findAllByTenant(tenantId: string, filters?: ComplianceDocumentFilters): Promise<StoredComplianceDocument[]>;
  deleteById(id: string, tenantId: string): Promise<void>;
  /**
   * Documents at or inside the reminder window that nobody has been told about
   * yet, across every tenant. Deliberately cross-tenant: the reminder sweep is
   * a background job, never reachable through a tenant-facing request.
   */
  findDueForReminder(onOrBeforeDate: string): Promise<StoredComplianceDocument[]>;
  /** Stamps the reminder time so a document is announced once per expiry. */
  markReminded(ids: string[], sentAt: Date): Promise<void>;
}

export const COMPLIANCE_DOCUMENT_REPOSITORY = Symbol("COMPLIANCE_DOCUMENT_REPOSITORY");

/**
 * `reminderDays` is the platform-wide window set by a platform admin, not the
 * document's own `reminderDays` column. That column is retained for now but no
 * longer decides status, so the badge and the reminder email agree.
 */
export function computeDocumentStatus(
  doc: StoredComplianceDocument,
  reminderDays: number,
): ComplianceDocumentStatus {
  if (!doc.expiryDate) return "valid";
  const today = new Date().toISOString().slice(0, 10);
  if (doc.expiryDate < today) return "expired";
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + reminderDays);
  const soonStr = soonDate.toISOString().slice(0, 10);
  if (doc.expiryDate <= soonStr) return "expiring";
  return "valid";
}
