/**
 * Every login, refresh and logout attempt, success or failure. This is the
 * hot path the requirements warn about — it is written on every
 * authentication request across every tenant, so volume and retention have
 * to be decided up front rather than discovered later.
 */
// access is a request refused because the caller had no business on that
// route. It counts toward automatic IP blocking alongside failed logins.
export const AUTH_EVENT_TYPES = ['login', 'logout', 'refresh', 'access'] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

export const AUTH_EVENT_STATUSES = ['success', 'failed'] as const;
export type AuthEventStatus = (typeof AUTH_EVENT_STATUSES)[number];

export const AUTH_FAILURE_REASONS = [
  'invalid_password',
  'user_not_found',
  'account_locked',
  'mfa_failed',
  'suspicious',
] as const;
export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

export type StoredAuthEvent = {
  id: string;
  /** Null on a failed login for an email that resolves to no tenant. */
  tenantId: string | null;
  userId: string | null;
  /** The address attempted, kept even when it belongs to nobody — that is itself a signal. */
  email: string | null;
  eventType: AuthEventType;
  status: AuthEventStatus;
  failureReason: AuthFailureReason | null;
  ipAddress: string;
  userAgent: string | null;
  occurredAt: Date;
};

export type AuthEventFilters = {
  tenantId?: string;
  eventType?: AuthEventType;
  status?: AuthEventStatus;
  ipAddress?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type AuthEventPage = {
  items: StoredAuthEvent[];
  total: number;
};

export interface AuthEventRepository {
  save(event: StoredAuthEvent): Promise<void>;
  search(filters: AuthEventFilters): Promise<AuthEventPage>;
  /** Failed login attempts, richer filters for the dedicated tab. */
  searchFailedLogins(filters: AuthEventFilters): Promise<AuthEventPage>;
  /**
   * Failed logins and refused requests from one IP within a trailing window,
   * for auto-block evaluation. Each rule has its own window, so this is read
   * once per rule. Excludes 'account_locked' failures (audience mismatch or a
   * disabled account) — those are not a credential-guessing signal.
   */
  countFailuresFromIp(ipAddress: string, since: Date): Promise<number>;
  countSince(status: AuthEventStatus, eventType: AuthEventType, since: Date): Promise<number>;
  /** Deletes events older than the cutoff. Returns how many rows were removed. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export const AUTH_EVENT_REPOSITORY = Symbol('AUTH_EVENT_REPOSITORY');

export function isAuthEventType(value: string): value is AuthEventType {
  return AUTH_EVENT_TYPES.includes(value as AuthEventType);
}

export function isAuthEventStatus(value: string): value is AuthEventStatus {
  return AUTH_EVENT_STATUSES.includes(value as AuthEventStatus);
}

export function isAuthFailureReason(value: string): value is AuthFailureReason {
  return AUTH_FAILURE_REASONS.includes(value as AuthFailureReason);
}
