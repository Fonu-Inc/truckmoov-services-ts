export const KYC_VERIFICATION_STATUSES = [
  'pending',
  'under_review',
  'verified',
  'rejected',
] as const;
export type KycVerificationStatus = (typeof KYC_VERIFICATION_STATUSES)[number];

export type StoredTenantBusinessInfo = {
  tenantId: string;
  companyName: string;
  registrationNumber: string | null;
  taxId: string | null;
  businessType: string | null;
  industry: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  billingEmail: string | null;
  website: string | null;
  yearEstablished: number | null;
  numberOfEmployees: number | null;
  verificationStatus: KycVerificationStatus;
  updatedAt: Date;
};

export interface TenantBusinessInfoRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantBusinessInfo | null>;
  save(info: StoredTenantBusinessInfo): Promise<void>;
}

export const TENANT_BUSINESS_INFO_REPOSITORY = Symbol(
  'TENANT_BUSINESS_INFO_REPOSITORY',
);
