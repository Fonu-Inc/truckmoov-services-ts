import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { ActivityLogService } from './activity-log.service';

type ApplicationActivity = { action: string; summary: string };

const RECORDS_APPLICATION_ACTIVITY = 'records_application_activity';

/** Puts a successful call on the application's timeline. */
export const RecordsApplicationActivity = (action: string, summary: string) =>
  SetMetadata(RECORDS_APPLICATION_ACTIVITY, { action, summary } satisfies ApplicationActivity);

type ResponseBody = { data?: { id?: string; automatedDecision?: string } } | undefined;

/**
 * Writes what the applicant did to the audit trail the admin timeline reads.
 * Declared per route so a new route opts in visibly, and written after the
 * response so a refused call never appears to have happened.
 */
@Injectable()
export class OnboardingActivityInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const activity = this.reflector.get<ApplicationActivity | undefined>(
      RECORDS_APPLICATION_ACTIVITY,
      context.getHandler(),
    );
    if (!activity) return next.handle();

    const params = context.switchToHttp().getRequest<{ params?: Record<string, string> }>().params;
    return next.handle().pipe(
      tap((body: ResponseBody) => {
        const applicationId = params?.applicationId ?? body?.data?.id;
        if (applicationId) void this.recordAll(applicationId, activity, body);
      }),
    );
  }

  private async recordAll(applicationId: string, activity: ApplicationActivity, body: ResponseBody) {
    await this.record(applicationId, activity.action, activity.summary, 'Applicant');
    const decision = body?.data?.automatedDecision;
    if (decision) {
      await this.record(applicationId, 'automated_decision', `Automated decision: ${decision.replace('_', ' ')}`, null);
    }
  }

  private async record(applicationId: string, action: string, summary: string, actorName: string | null) {
    try {
      await this.activityLog.record({
        tenantId: 'system',
        service: 'auth',
        action: `onboarding.application.${action}`,
        entityType: 'onboarding_application',
        entityId: applicationId,
        summary,
        actorId: null,
        actorRole: null,
        actorName,
        metadata: { applicationId },
      });
    } catch {
      // The trail is a record of the call, never a reason for it to fail.
    }
  }
}
