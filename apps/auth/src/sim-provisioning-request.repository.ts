export type StoredSimProvisioningRequest = {
  id: string;
  tenantId: string;
  tenantName: string;
  requestType: string;
  numberOfSims: number;
  preferredOperator: string;
  requestedPlan: string;
  requestedDataLimitMb: number;
  deploymentTimeline: string | null;
  useCase: string | null;
  deviceMappingData: Record<string, unknown>[] | null;
  status: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  fonuRequestId: string | null;
  fonuResponse: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface SimProvisioningRequestRepository {
  findAll(filters?: { status?: string }): Promise<StoredSimProvisioningRequest[]>;
  findById(id: string): Promise<StoredSimProvisioningRequest | null>;
  save(request: StoredSimProvisioningRequest): Promise<void>;
}

export const SIM_PROVISIONING_REQUEST_REPOSITORY = Symbol(
  'SIM_PROVISIONING_REQUEST_REPOSITORY',
);
