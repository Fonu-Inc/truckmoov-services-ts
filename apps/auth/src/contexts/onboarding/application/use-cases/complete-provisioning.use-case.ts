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

export class ApplicationNotProvisionableError extends Error {
  constructor(stage: string) {
    super(`An onboarding at the ${stage} stage cannot be marked provisioned`);
    this.name = 'ApplicationNotProvisionableError';
  }
}

@Injectable()
export class CompleteProvisioningUseCase {
  private readonly logger = new Logger(CompleteProvisioningUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * Says the devices and SIMs for this onboarding are allocated, which is what
   * opens payment.
   *
   * An administrator's call rather than an automatic step: stock is physical,
   * and nothing in the platform knows whether it is on a shelf.
   */
  async execute(input: { accessToken: string; applicationId: string }) {
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

    await this.applications.save({
      ...application,
      stage: 'payment',
      updatedAt: new Date(),
    });
    this.logger.log(
      `onboarding_provisioned:${application.reference}:by=${actor.id}`,
    );

    return {
      status: true,
      message: 'Provisioning complete, awaiting payment',
      data: { applicationId: application.id, stage: 'payment' },
    };
  }
}
