import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from '../../../../system-authz';
import {
  ACTIVITY_LOG_REPOSITORY,
  type ActivityLogRepository,
} from '../../../../activity-log.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { ApplicationNotFoundError } from '@auth/onboarding/domain/onboarding-application.support';

const ONBOARDING_ENTITY_TYPE = 'onboarding_application';
const TIMELINE_LIMIT = 200;

@Injectable()
export class GetOnboardingApplicationTimelineUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ACTIVITY_LOG_REPOSITORY)
    private readonly activity: ActivityLogRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * Everything that has happened to one application, oldest first.
   *
   * Read from the audit trail rather than from a column the screens write to:
   * a timeline assembled from the record of what happened cannot disagree with
   * what happened.
   */
  async execute(accessToken: string, applicationId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);

    const application = await this.applications.findById(applicationId);
    if (!application) throw new ApplicationNotFoundError();

    const entries = await this.activity.queryAcrossTenants({
      entityType: ONBOARDING_ENTITY_TYPE,
      entityId: application.id,
      limit: TIMELINE_LIMIT,
    });

    return {
      status: true,
      message: 'success',
      data: {
        applicationId: application.id,
        reference: application.reference,
        entries: entries
          .map((entry) => ({
            action: entry.action,
            summary: entry.summary,
            // Null actor means nobody did it by hand, which is what the screen
            // shows as a SYSTEM entry.
            actor: entry.actorName ?? entry.actorId ?? 'SYSTEM',
            at: entry.occurredAt,
          }))
          .sort((a, b) => a.at.localeCompare(b.at)),
      },
    };
  }
}
