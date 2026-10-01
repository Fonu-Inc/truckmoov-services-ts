export type BillingActor = {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  tenantId: string;
};

export type BillingAuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export interface BillingAudit {
  record(actor: BillingActor, entry: BillingAuditEntry): Promise<void>;
}

export const BILLING_AUDIT = Symbol('BILLING_AUDIT');
