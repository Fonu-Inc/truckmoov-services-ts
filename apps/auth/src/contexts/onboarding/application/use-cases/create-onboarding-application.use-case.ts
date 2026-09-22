import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
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
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  BusinessEmailInUseError,
  generateApplicationReference,
  generateApplicationToken,
  hashApplicationToken,
  toApplicationView,
} from '@auth/onboarding/domain/onboarding-application.support';
import {
  validateApplicantType,
  validateBusinessEmail,
  validateCity,
  validateContactFullName,
  validateContactRole,
  validateIdentificationNumber,
  validateIdentificationType,
  validateNigerianPhone,
  validateOrganizationName,
  validateRcNumber,
  validateState,
  validateStreetAddress,
  validateTaxIdentificationNumber,
} from '@auth/onboarding/domain/onboarding-application.validation';
import { enforceIdentityClaims } from './support/enforce-identity-claims';
import { resolveM2mPlanCode } from './support/resolve-m2m-plan';

export type CreateOnboardingApplicationCommand = {
  applicantType: unknown;
  organizationName: unknown;
  businessEmail: unknown;
  organizationPhone: unknown;
  contactFullName: unknown;
  contactRole?: unknown;
  streetAddress: unknown;
  city: unknown;
  state: unknown;
  rcNumber?: unknown;
  taxIdentificationNumber?: unknown;
  identificationType?: unknown;
  identificationNumber?: unknown;
  m2mPlanCode?: unknown;
};

@Injectable()
export class CreateOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(IDENTITY_CLAIM_REPOSITORY)
    private readonly identityClaims: IdentityClaimRepository,
  ) {}

  async execute(command: CreateOnboardingApplicationCommand) {
    const details = validateApplicationDetails(command);
    const m2mPlanCode = await resolveM2mPlanCode(this.plans, command.m2mPlanCode);
    await this.assertEmailIsFree(details.businessEmail);

    const now = new Date();
    const token = generateApplicationToken();
    const application: StoredOnboardingApplication = {
      id: this.idGenerator.generate(),
      reference: generateApplicationReference(),
      tokenHash: hashApplicationToken(token),
      ...details,
      m2mPlanCode,
      billingEmail: null,
      billingEmailVerifiedAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: 'draft',
      stage: 'application',
      submittedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      tenantId: null,
      setupLinkStatus: null,
      setupLinkSentAt: null,
      setupLinkError: null,
      setupLinkAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.applications.save(application);
    await enforceIdentityClaims(
      this.identityClaims,
      this.applications,
      application,
    );

    return {
      status: true,
      message: 'Application started',
      data: {
        // Returned once. It is the only credential the applicant has, and it
        // is what stops application ids being walked by a stranger.
        applicationToken: token,
        ...toApplicationView(application, []),
      },
    };
  }

  private async assertEmailIsFree(businessEmail: string): Promise<void> {
    const existingUser = await this.users.findByEmail(businessEmail);
    if (existingUser) throw new BusinessEmailInUseError();

    const liveApplication =
      await this.applications.findLiveByBusinessEmail(businessEmail);
    if (liveApplication) throw new BusinessEmailInUseError();
  }
}

export function validateApplicationDetails(
  command: CreateOnboardingApplicationCommand,
) {
  return {
    applicantType: validateApplicantType(command.applicantType),
    organizationName: validateOrganizationName(command.organizationName),
    businessEmail: validateBusinessEmail(command.businessEmail),
    organizationPhone: validateNigerianPhone(
      command.organizationPhone,
      'organizationPhone',
    ),
    contactFullName: validateContactFullName(command.contactFullName),
    contactRole: validateContactRole(command.contactRole),
    streetAddress: validateStreetAddress(command.streetAddress),
    city: validateCity(command.city),
    state: validateState(command.state),
    rcNumber: validateRcNumber(command.rcNumber),
    taxIdentificationNumber: validateTaxIdentificationNumber(
      command.taxIdentificationNumber,
    ),
    identificationType: validateIdentificationType(command.identificationType),
    identificationNumber: validateIdentificationNumber(
      command.identificationNumber,
    ),
  };
}
