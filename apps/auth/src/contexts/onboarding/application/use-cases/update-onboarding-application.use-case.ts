import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@auth/session/domain/ports/user-repository.port';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  IDENTITY_CLAIM_REPOSITORY,
  type IdentityClaimRepository,
} from '@auth/onboarding/domain/identity-claim.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  validateApplicationDetails,
  type CreateOnboardingApplicationCommand,
} from './create-onboarding-application.use-case';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import {
  assertApplicationEditable,
  BusinessEmailInUseError,
} from '@auth/onboarding/domain/onboarding-application.support';
import { loadApplicationView } from './support/load-application-view';
import { enforceIdentityClaims } from './support/enforce-identity-claims';
import { resolveM2mPlanCode } from './support/resolve-m2m-plan';

@Injectable()
export class UpdateOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(IDENTITY_CLAIM_REPOSITORY)
    private readonly identityClaims: IdentityClaimRepository,
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

    const details = validateApplicationDetails(command, application);
    const m2mPlanCode = await resolveM2mPlanCode(this.plans, command.m2mPlanCode);
    if (details.businessEmail !== application.businessEmail) {
      await this.assertEmailIsFree(details.businessEmail, application.id);
    }

    const updated = {
      ...application,
      ...details,
      m2mPlanCode,
      returningCustomer:
        command.returningCustomer === undefined
          ? application.returningCustomer ?? false
          : command.returningCustomer === true,
      // Chosen on the documents step, so a details save without it keeps it.
      ...(command.identificationType === undefined
        ? { identificationType: application.identificationType }
        : {}),
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
    await enforceIdentityClaims(
      this.identityClaims,
      this.applications,
      updated,
    );

    return {
      status: true,
      message: 'Application updated',
      data: await loadApplicationView(this.applications, updated),
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
