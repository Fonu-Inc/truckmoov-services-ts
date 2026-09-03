import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './contexts/auth/session/domain/ports/user-repository.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from './onboarding-application.repository';
import {
  validateApplicationDetails,
  type CreateOnboardingApplicationCommand,
} from './create-onboarding-application.use-case';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import {
  assertApplicationEditable,
  BusinessEmailInUseError,
  toApplicationView,
} from './onboarding-application.support';

@Injectable()
export class UpdateOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(
    applicationId: string,
    applicationToken: string,
    command: CreateOnboardingApplicationCommand,
  ) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    assertApplicationEditable(application);

    const details = validateApplicationDetails(command);
    if (details.businessEmail !== application.businessEmail) {
      await this.assertEmailIsFree(details.businessEmail, application.id);
    }

    const updated = {
      ...application,
      ...details,
      // Changing a verified contact drops that verification: the code was
      // proven against the old address, not the new one.
      emailVerifiedAt:
        details.businessEmail === application.businessEmail
          ? application.emailVerifiedAt
          : null,
      phoneVerifiedAt:
        details.organizationPhone === application.organizationPhone
          ? application.phoneVerifiedAt
          : null,
      updatedAt: new Date(),
    };

    if (updated.emailVerifiedAt === null && application.emailVerifiedAt !== null) {
      await this.applications.invalidateVerificationCodes(application.id, 'email');
    }
    if (updated.phoneVerifiedAt === null && application.phoneVerifiedAt !== null) {
      await this.applications.invalidateVerificationCodes(application.id, 'sms');
    }

    await this.applications.save(updated);
    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    return {
      status: true,
      message: 'Application updated',
      data: toApplicationView(updated, documents),
    };
  }

  private async assertEmailIsFree(
    businessEmail: string,
    applicationId: string,
  ): Promise<void> {
    const existingUser = await this.users.findByEmail(businessEmail);
    if (existingUser) throw new BusinessEmailInUseError();

    const liveApplication =
      await this.applications.findLiveByBusinessEmail(businessEmail);
    if (liveApplication && liveApplication.id !== applicationId) {
      throw new BusinessEmailInUseError();
    }
  }
}
