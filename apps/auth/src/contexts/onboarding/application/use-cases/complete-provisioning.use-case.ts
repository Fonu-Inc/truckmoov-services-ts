import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { ApplicationNotFoundError } from '@auth/onboarding/domain/onboarding-application.support';
import { OnboardingProvisioningService } from '../services/onboarding-provisioning.service';

export class ApplicationNotProvisionableError extends Error {
  constructor(stage: string) {
    super(`An onboarding at the ${stage} stage cannot be marked provisioned`);
    this.name = 'ApplicationNotProvisionableError';
  }
}

export class ProvisioningReasonRequiredError extends Error {
  constructor() {
    super(
      'Device stock does not cover this order yet. Give a reason (at least 5 characters) to open payment anyway.',
    );
    this.name = 'ProvisioningReasonRequiredError';
  }
}

const REASON_MIN = 5;

@Injectable()
export class CompleteProvisioningUseCase {
  private readonly logger = new Logger(CompleteProvisioningUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(OnboardingProvisioningService)
    private readonly provisioning: OnboardingProvisioningService,
  ) {}

  /**
   * Opens payment for an application waiting on devices.
   *
   * With stock on hand the move needs no justification. Without it, staff are
   * vouching for stock the platform cannot see, so a reason is required and
   * kept in the audit trail.
   */
  async execute(input: {
    accessToken: string;
    applicationId: string;
    reason?: string;
  }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (application.stage !== 'provisioning') {
      throw new ApplicationNotProvisionableError(application.stage);
    }

    const stockCovers = await this.provisioning.stockCovers(application);
    const reason = input.reason?.trim() ?? '';
    if (!stockCovers && reason.length < REASON_MIN) {
      throw new ProvisioningReasonRequiredError();
    }

    await this.provisioning.openPayment(application);
    this.logger.log(
      `onboarding_provisioned:${application.reference}:by=${actor.id}:confirmed_without_stock=${!stockCovers}`,
    );

    return {
      status: true,
      message: 'Provisioning complete, awaiting payment',
      data: {
        applicationId: application.id,
        stage: 'payment',
        confirmedWithoutStock: !stockCovers,
        reason: stockCovers ? null : reason,
      },
    };
  }
}
