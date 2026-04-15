export type StoredSimActivationBatch = {
  id: string;
  requestId: string | null;
  tenantId: string;
  tenantName: string;
  activationMode: string;
  quantity: number;
  operator: string;
  requestedPlan: string;
  dataLimitGb: number;
  deviceMappingData: Record<string, unknown>[] | null;
  status: string;
  simsActivated: number;
  simsFailed: number;
  fonuResponse: Record<string, unknown> | null;
  createdBy: string | null;
  createdByName: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface SimActivationBatchRepository {
  findAll(filters?: { status?: string }): Promise<StoredSimActivationBatch[]>;
  findById(id: string): Promise<StoredSimActivationBatch | null>;
  save(batch: StoredSimActivationBatch): Promise<void>;
}

export const SIM_ACTIVATION_BATCH_REPOSITORY = Symbol(
  'SIM_ACTIVATION_BATCH_REPOSITORY',
);
