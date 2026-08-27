/**
 * Notable authentication and authorisation events, kept apart from the
 * hash-chained activity log: that log is a compliance trail of what an actor
 * did, this is a triage screen for what looks dangerous, and the two have
 * different readers and different filters (severity, not actor).
 */
export const SECURITY_EVENT_TYPES = [
  'ip_auto_blocked',
  'ip_manually_blocked',
  'unusual_location',
  'two_factor_enabled',
  'account_locked',
  'api_key_created',
  'role_elevated',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_EVENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SecurityEventSeverity = (typeof SECURITY_EVENT_SEVERITIES)[number];

export type StoredSecurityEvent = {
  id: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  tenantId: string | null;
  /**
   * Built once, server-side, from the structured fields below — never the
   * only record of what happened. A composed sentence cannot be filtered,
   * linked, or translated, which is why the parts are kept alongside it.
   */
  summary: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type SecurityEventFilters = {
  tenantId?: string;
  severity?: SecurityEventSeverity;
  eventType?: SecurityEventType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type SecurityEventPage = {
  items: StoredSecurityEvent[];
  total: number;
};

export interface SecurityEventRepository {
  save(event: StoredSecurityEvent): Promise<void>;
  search(filters: SecurityEventFilters): Promise<SecurityEventPage>;
  countBySeverity(severity: SecurityEventSeverity, since?: Date): Promise<number>;
}

export const SECURITY_EVENT_REPOSITORY = Symbol('SECURITY_EVENT_REPOSITORY');

export function isSecurityEventSeverity(value: string): value is SecurityEventSeverity {
  return SECURITY_EVENT_SEVERITIES.includes(value as SecurityEventSeverity);
}
