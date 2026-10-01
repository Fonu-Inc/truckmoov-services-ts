export type SuspensionCause = 'manual' | 'non_payment';
export type CascadeStatus = 'pending' | 'complete' | 'partial' | 'restoring' | 'restore_partial';
export type CascadeStep = 'users' | 'fleet' | 'sims';
export type StepState = 'pending' | 'done' | 'failed';

export type AssetCounts = {
  users: number;
  devices: number;
  sims: number;
  vehicles: number;
  shareLinks: number;
};

export type CascadeProgress = {
  users?: StepState;
  fleet?: StepState;
  sims?: StepState;
  counts?: Partial<AssetCounts>;
};

export type StoredTenantSuspension = {
  tenantId: string;
  suspendedAt: Date;
  suspendedBy: string;
  reason: string;
  cause: SuspensionCause;
  unpaidSince: string | null;
  graceDays: number | null;
  cascadeStatus: CascadeStatus;
  cascadeProgress: CascadeProgress;
  cascadeAttempts: number;
  cascadeLastError: string | null;
  cascadeCompletedAt: Date | null;
};

export type NewTenantSuspension = Pick<StoredTenantSuspension, 'tenantId' | 'suspendedBy' | 'reason'> & {
  cause: SuspensionCause;
  unpaidSince?: string | null;
  graceDays?: number | null;
};

export type CascadePatch = {
  status: CascadeStatus;
  progress: CascadeProgress;
  attempts: number;
  lastError: string | null;
  completedAt: Date | null;
};

export interface TenantSuspensionRepository {
  findAll(): Promise<StoredTenantSuspension[]>;
  findOne(tenantId: string): Promise<StoredTenantSuspension | null>;
  /** Writes only when no row exists. Returns whether this call wrote it. */
  insertIfAbsent(row: NewTenantSuspension): Promise<boolean>;
  /** Staff suspend: becomes a manual row, keeping the unpaid-since stamp of any earlier row and the original time and actor of an earlier manual row. */
  upsertManual(row: NewTenantSuspension): Promise<void>;
  setCascade(tenantId: string, patch: CascadePatch): Promise<void>;
  remove(tenantId: string): Promise<void>;
  findIncomplete(): Promise<StoredTenantSuspension[]>;
}

export const TENANT_SUSPENSION_REPOSITORY = Symbol('TENANT_SUSPENSION_REPOSITORY');

export const INCOMPLETE_CASCADE_STATUSES: readonly CascadeStatus[] = [
  'pending',
  'partial',
  'restoring',
  'restore_partial',
];
