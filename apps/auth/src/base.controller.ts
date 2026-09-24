import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import type { AuthFailureReason } from './auth-event.repository';
import {
  EmailNotVerifiedError,
  ForbiddenError,
  InvalidAccessTokenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from './contexts/auth/session';
import { SessionExpiredError } from './contexts/auth/session/domain/errors/session-expired.error';

export abstract class BaseAuthController {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly activityLogService: ActivityLogService) {}

  protected async runAuthUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof InvalidRefreshTokenError ||
        // A timed-out session is a 401 like any other dead credential. The
        // message says why so the client can show "signed out for inactivity"
        // rather than implying the password was wrong.
        error instanceof SessionExpiredError
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

  protected mapLoginFailureReason(error: unknown): AuthFailureReason {
    if (error instanceof EmailNotVerifiedError || error instanceof ForbiddenError) return 'account_locked';
    return 'invalid_password';
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
  ): Promise<void> {
    try {
      await this.activityLogService.record(command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }

  protected async tryRecordActivityFromAccessToken(
    accessToken: string,
    command: Parameters<ActivityLogService['recordFromAccessToken']>[1],
  ): Promise<void> {
    try {
      await this.activityLogService.recordFromAccessToken(accessToken, command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }
}
