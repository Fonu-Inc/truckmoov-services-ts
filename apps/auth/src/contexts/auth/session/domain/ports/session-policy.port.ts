/**
 * Policy the session flow has to honour but does not own.
 *
 * Read through a port rather than by reaching for platform settings directly:
 * the session context should not know that an administrator screen exists, and
 * a deployment with no settings row still has to log people in.
 */
export interface SessionPolicyReader {
  /** Idle minutes before a session is refused, or null for no timeout. */
  idleTimeoutMinutes(): Promise<number | null>;
}

export const SESSION_POLICY_READER = Symbol("SESSION_POLICY_READER");
