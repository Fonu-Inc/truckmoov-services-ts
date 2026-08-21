export const KYC_DOCUMENT_TYPES = [
  'certificate_of_incorporation',
  'memorandum_of_association',
  'tax_clearance',
  'vat_certificate',
  'business_license',
  'insurance_certificate',
  'proof_of_address',
  'director_id',
  'other',
] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export type StoredKycDocument = {
  id: string;
  tenantId: string;
  documentType: KycDocumentType;
  documentName: string;
  fileKey: string;
  fileSize: number;
  status: KycDocumentStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const KYC_DOCUMENT_STATUSES = [
  'pending',
  'under_review',
  'verified',
  'rejected',
] as const;
export type KycDocumentStatus = (typeof KYC_DOCUMENT_STATUSES)[number];

export type KycDocumentQueueFilters = {
  status?: KycDocumentStatus;
  tenantId?: string;
  page?: number;
  limit?: number;
};

export interface KycDocumentRepository {
  findAllByTenantId(tenantId: string): Promise<StoredKycDocument[]>;
  findById(id: string): Promise<StoredKycDocument | null>;
  findForReview(
    filters?: KycDocumentQueueFilters,
  ): Promise<{ items: StoredKycDocument[]; total: number }>;
  save(doc: StoredKycDocument): Promise<void>;
  delete(id: string): Promise<void>;
}

export const KYC_DOCUMENT_REPOSITORY = Symbol('KYC_DOCUMENT_REPOSITORY');
