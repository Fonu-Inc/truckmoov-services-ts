import type { CodeAttemptPolicy, TwoFactorRepository } from './two-factor.repository';

/**
 * Per account, on top of the per-IP limit. A cooldown rather than a lockout:
 * codes rotate, and a mistype during a rotation must not lock anybody out.
 */
export const CODE_ATTEMPT_POLICY: CodeAttemptPolicy = { limit: 3, cooldownMs: 60_000 };

export class TwoFactorCooldownError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many wrong codes, try again in ${retryAfterSeconds} seconds`);
  }
}

/**
 * Checks one code under the account's cooldown. While it cools down the code
 * is not evaluated at all. Null when the code was wrong.
 */
export async function checkCodeAttempt<T>(
  repository: TwoFactorRepository,
  userId: string,
  evaluate: () => T | null,
): Promise<T | null> {
  const now = new Date();
  const blockedUntil = await repository.claimCodeAttempt(userId, now, CODE_ATTEMPT_POLICY);
  if (blockedUntil) throw new TwoFactorCooldownError(secondsUntil(blockedUntil, now));

  const result = evaluate();
  if (result !== null) await repository.clearCodeAttempts(userId);
  return result;
}

function secondsUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}
