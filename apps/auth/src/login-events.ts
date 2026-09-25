import { Inject, Injectable } from '@nestjs/common';
import { resolveClientIp } from '@shared/http';
import type { AuthFailureReason } from './auth-event.repository';
import { EmailNotVerifiedError, ForbiddenError } from './contexts/auth/session';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';
import { InvalidChallengeError, LoginCodeRefusedError } from './two-factor-login.use-case';
import { InvalidTwoFactorCodeError } from './two-factor.use-cases';

export type LoginOrigin = { ipAddress: string; userAgent: string | null };

export function loginOrigin(req: { ip?: string }, userAgent?: string): LoginOrigin {
  return { ipAddress: resolveClientIp(req), userAgent: userAgent ?? null };
}

/**
 * A wrong code counts toward the IP's automatic block like a wrong password.
 * A disabled or wrong-portal account does not: it is not a guessing signal.
 */
export function loginFailureReason(error: unknown): AuthFailureReason {
  if (error instanceof InvalidChallengeError || error instanceof InvalidTwoFactorCodeError) return 'mfa_failed';
  if (error instanceof EmailNotVerifiedError || error instanceof ForbiddenError) return 'account_locked';
  return 'invalid_password';
}

/** The auth events of a sign-in, from either step. */
@Injectable()
export class LoginEvents {
  constructor(@Inject(RecordAuthEventUseCase) private readonly events: RecordAuthEventUseCase) {}

  /** Runs one step of a sign-in, recording a failure before it propagates. */
  async recordingFailure<T>(origin: LoginOrigin, email: string | null, step: () => Promise<T>): Promise<T> {
    try {
      return await step();
    } catch (error) {
      await this.failed(error, origin, email);
      throw error;
    }
  }

  async succeeded(user: { id: string; tenantId: string; email: string }, origin: LoginOrigin): Promise<void> {
    await this.events.execute({
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
      eventType: 'login',
      status: 'success',
      ...origin,
    });
  }

  private async failed(error: unknown, origin: LoginOrigin, email: string | null): Promise<void> {
    const user = error instanceof LoginCodeRefusedError ? error.user : null;
    await this.events.execute({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? null,
      email: user?.email ?? email,
      eventType: 'login',
      status: 'failed',
      failureReason: loginFailureReason(error),
      ...origin,
    });
  }
}
