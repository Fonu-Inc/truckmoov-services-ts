export type StoredTenantTermination = {
  tenantId: string;
  reason: string;
  terminatedBy: string;
  terminatedAt: Date;
  /** What the platform actually carried out, so the record does not overstate it. */
  simsDeactivated: number;
  usersDisabled: number;
};

/**
 * Terminations, one per tenant, append-only.
 *
 * Stored rather than derived: every other tenant status falls out of whether
 * its users are enabled, and a terminated tenant looks exactly like a suspended
 * one by that measure. It also has to carry the reason, which the audit trail
 * needs and a derived status cannot hold.
 */
export interface TenantTerminationRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantTermination | null>;
  listTenantIds(): Promise<string[]>;
  save(termination: StoredTenantTermination): Promise<void>;
}

export const TENANT_TERMINATION_REPOSITORY = Symbol('TENANT_TERMINATION_REPOSITORY');

export const TERMINATION_CONFIRMATION = 'TERMINATE';
export const MIN_TERMINATION_REASON_LENGTH = 10;

export class TenantTerminationError extends Error {}

/**
 * Both gates on the confirmation dialog. Checked server-side because a client
 * that skips the modal must not be able to skip the intent it establishes.
 */
export function assertTerminationRequest(input: {
  reason: string;
  confirmation: string;
}): string {
  const reason = input.reason?.trim() ?? '';
  if (reason.length < MIN_TERMINATION_REASON_LENGTH) {
    throw new TenantTerminationError(
      `A termination reason of at least ${MIN_TERMINATION_REASON_LENGTH} characters is required`,
    );
  }
  if (input.confirmation !== TERMINATION_CONFIRMATION) {
    throw new TenantTerminationError(`Type ${TERMINATION_CONFIRMATION} to confirm`);
  }
  return reason;
}
