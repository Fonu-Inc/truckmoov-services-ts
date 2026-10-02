import { ForbiddenException, HttpException, HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import {
  EmailNotVerifiedError,
  ForbiddenError,
  InvalidAccessTokenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  UserNotFoundError,
} from './contexts/auth/session';
import { SessionExpiredError } from './contexts/auth/session/domain/errors/session-expired.error';
import { InvalidChallengeError } from './two-factor-login.use-case';
import { InvalidTwoFactorCodeError } from './two-factor.use-cases';
import { TwoFactorCooldownError } from './two-factor-attempts';

/** A token naming no live account is a 401; a disabled account is refused like any forbidden call. */
export function rethrowActorError(error: unknown): void {
  if (error instanceof InvalidAccessTokenError || error instanceof UserNotFoundError) {
    throw new UnauthorizedException(error.message);
  }
  if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
}

export abstract class BaseAuthController {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly activityLogService: ActivityLogService) {}

  protected async runAuthUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      this.rethrowCodeCooldown(error);
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof InvalidRefreshTokenError ||
        // A timed-out session is a 401 like any other dead credential. The
        // message says why so the client can show "signed out for inactivity"
        // rather than implying the password was wrong.
        error instanceof SessionExpiredError ||
        error instanceof InvalidChallengeError ||
        error instanceof InvalidTwoFactorCodeError
      ) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof EmailNotVerifiedError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }

  protected rethrowCodeCooldown(error: unknown): void {
    if (error instanceof TwoFactorCooldownError) {
      throw new HttpException(
        { message: error.message, retryAfterSeconds: error.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  protected rethrowInvalidAccessToken(error: unknown): void {
    if (error instanceof InvalidAccessTokenError) {
      throw new UnauthorizedException(error.message);
    }
  }

  protected extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }

  protected parseNumericQuery(value?: string): number | undefined {
    if (value == null || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  protected async tryRecordActivity(
    command: Parameters<ActivityLogService['record']>[0],
  ): Promise<boolean> {
    try {
      await this.activityLogService.record(command);
      return true;
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
      return false;
    }
  }

  protected async tryRecordActivityFromAccessToken(
    accessToken: string,
    command: Parameters<ActivityLogService['recordFromAccessToken']>[1],
  ): Promise<boolean> {
    try {
      await this.activityLogService.recordFromAccessToken(accessToken, command);
      return true;
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
      return false;
    }
  }
}
