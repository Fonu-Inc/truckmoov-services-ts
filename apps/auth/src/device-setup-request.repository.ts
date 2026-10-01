import type { DeviceSetupRequestStatus } from '@shared/devices';

export {
  SETUP_REQUEST_APPROVED_STATUSES,
  SETUP_REQUEST_PENDING_STATUSES,
  type DeviceSetupRequestStatus,
} from '@shared/devices';

/**
 * A device request as the platform approval queue reads it.
 *
 * This is the row the tenant wrote in the fleet service. The platform used to
 * keep its own copy in a second table, which nothing ever wrote to, so the
 * queue showed an empty list while requests piled up elsewhere.
 */
export type StoredDeviceSetupRequest = {
  id: string;
  tenantId: string;
  organisationName: string | null;
  requestingEmail: string | null;
  referenceNumber: string;
  /** Null until the platform picks the hardware; the tenant no longer chooses it. */
  manufacturer: string | null;
  model: string | null;
  trackerType: string | null;
  quantity: number;
  simRequired: boolean;
  vehicleId: string | null;
  state: string | null;
  city: string | null;
  preferredInstallDate: Date | null;
  useCase: string;
  notes: string | null;
  status: DeviceSetupRequestStatus;
  /** Whether the tenant's onboarding was approved. Null when they never applied. */
  kycStatus: 'verified' | 'pending' | 'rejected' | null;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  timeline: Array<{ status: string; at: string; note: string | null }>;
  createdAt: Date;
  updatedAt: Date;
};

export type DeviceSetupRequestFilters = {
  status?: string;
  tenantId?: string;
  search?: string;
  manufacturer?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type DeviceSetupRequestSummary = {
  pendingApproval: number;
  /** Approved, waiting on the platform to confirm payment. Also counted in approved. */
  awaitingPayment: number;
  approved: number;
  rejected: number;
  devicesRequested: number;
};

export interface DeviceSetupRequestRepository {
  findAll(filters?: DeviceSetupRequestFilters): Promise<StoredDeviceSetupRequest[]>;
  findById(id: string): Promise<StoredDeviceSetupRequest | null>;
  summary(): Promise<DeviceSetupRequestSummary>;
  /**
   * Records a platform decision. Narrower than a general save: the platform
   * owns the decision columns and the timeline entry, and nothing else on a
   * request the tenant submitted.
   */
  recordDecision(input: {
    id: string;
    status: DeviceSetupRequestStatus;
    decidedBy: string;
    reason: string | null;
    timeline: Array<{ status: string; at: string; note: string | null }>;
  }): Promise<void>;
  assign(
    id: string,
    assignedTo: string,
    timeline: Array<{ status: string; at: string; note: string | null }>,
  ): Promise<void>;
  /** A plain step along the lifecycle, such as payment confirmed. */
  advance(input: {
    id: string;
    status: DeviceSetupRequestStatus;
    timeline: Array<{ status: string; at: string; note: string | null }>;
  }): Promise<void>;
}

export const DEVICE_SETUP_REQUEST_REPOSITORY = Symbol('DEVICE_SETUP_REQUEST_REPOSITORY');

/** Every status change is recorded, so the detail drawer's timeline is complete. */
export function appendSetupRequestTimeline(
  request: StoredDeviceSetupRequest,
  status: DeviceSetupRequestStatus,
  note: string | null,
) {
  return [...request.timeline, { status, at: new Date().toISOString(), note }];
}
