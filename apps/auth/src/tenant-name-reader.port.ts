/**
 * A tenant's organisation name, for display on rows that outlive the tenant.
 *
 * A port rather than a query inside the activity log, so writing an audit
 * entry does not couple the logger to the onboarding schema.
 */
export interface TenantNameReader {
  organizationNameFor(tenantId: string): Promise<string | null>;
}

export const TENANT_NAME_READER = Symbol('TENANT_NAME_READER');

/**
 * The platform's own audit rows are filed under a tenant id that is not a
 * tenant. Left bare it reads as an unnamed customer.
 */
export const SYSTEM_TENANT_LABEL = 'System / Platform';
