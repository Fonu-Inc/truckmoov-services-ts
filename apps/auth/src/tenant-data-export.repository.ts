export const TENANT_EXPORT_SCOPES = ['vehicles', 'drivers', 'devices', 'sims', 'users', 'invoices', 'all'] as const;
export type TenantExportScope = (typeof TENANT_EXPORT_SCOPES)[number];

export const TENANT_EXPORT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type TenantExportStatus = (typeof TENANT_EXPORT_STATUSES)[number];

export const EXPORT_RETENTION_DAYS = 7;

export function isTenantExportScope(value: unknown): value is TenantExportScope {
  return typeof value === 'string' && (TENANT_EXPORT_SCOPES as readonly string[]).includes(value);
}

export type StoredTenantDataExport = {
  id: string;
  tenantId: string;
  scope: TenantExportScope;
  status: TenantExportStatus;
  rowCounts: Record<string, number>;
  fileKey: string | null;
  fileName: string | null;
  fileBytes: number | null;
  error: string | null;
  requestedBy: string;
  requestedByName: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type TenantExportOutcome =
  | { status: 'ready'; rowCounts: Record<string, number>; fileKey: string; fileName: string; fileBytes: number }
  | { status: 'failed'; error: string };

export interface TenantDataExportRepository {
  create(job: StoredTenantDataExport): Promise<void>;
  finish(id: string, outcome: TenantExportOutcome): Promise<void>;
  findById(tenantId: string, id: string): Promise<StoredTenantDataExport | null>;
  listForTenant(tenantId: string, limit: number): Promise<StoredTenantDataExport[]>;
}

export const TENANT_DATA_EXPORT_REPOSITORY = Symbol('TENANT_DATA_EXPORT_REPOSITORY');
