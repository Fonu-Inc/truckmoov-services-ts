import type { TenantOrganizationType } from './tenant-onboarding.repository';

export const UPGRADE_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type UpgradeRequestStatus = (typeof UPGRADE_REQUEST_STATUSES)[number];

export type OrganisationUpgradeRequest = {
  id: string;
  tenantId: string;
  fromOrganisationType: TenantOrganizationType;
  toOrganisationType: TenantOrganizationType;
  reason: string;
  /** What the requester claimed. Kept for the record, never used to decide. */
  statedVehicleCount: number;
  status: UpgradeRequestStatus;
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  /** The live count when the decision was made, which is what justified it. */
  vehicleCountAtReview: number | null;
  /** The plan the reviewer chose on approval. Null until decided. */
  targetPlanCode: string | null;
};

export interface OrganisationUpgradeRepository {
  save(request: OrganisationUpgradeRequest): Promise<void>;
  findById(id: string): Promise<OrganisationUpgradeRequest | null>;
  findOpenForTenant(tenantId: string): Promise<OrganisationUpgradeRequest | null>;
  findByStatus(status: UpgradeRequestStatus): Promise<OrganisationUpgradeRequest[]>;
  countPending(): Promise<number>;
  findRecentlyReviewed(limit: number): Promise<OrganisationUpgradeRequest[]>;
}

export const ORGANISATION_UPGRADE_REPOSITORY = Symbol('ORGANISATION_UPGRADE_REPOSITORY');

export class UpgradeAlreadyRequestedError extends Error {
  constructor() {
    super('An upgrade request is already open for this organisation');
  }
}

export class UpgradeRequestNotFoundError extends Error {
  constructor() {
    super('Upgrade request not found');
  }
}

export class UpgradeAlreadyDecidedError extends Error {
  constructor(status: UpgradeRequestStatus) {
    super(`This request was already ${status}`);
  }
}
