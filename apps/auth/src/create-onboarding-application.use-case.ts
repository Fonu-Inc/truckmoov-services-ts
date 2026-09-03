import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './contexts/auth/session/domain/ports/user-repository.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from './onboarding-application.repository';
import {
  BusinessEmailInUseError,
  generateApplicationReference,
  generateApplicationToken,
  hashApplicationToken,
  toApplicationView,
} from './onboarding-application.support';
import {
  validateApplicantType,
  validateBusinessEmail,
  validateCity,
  validateContactFullName,
  validateContactRole,
  validateNigerianPhone,
  validateOrganizationName,
  validateState,
  validateStreetAddress,
} from './onboarding-application.validation';

export type CreateOnboardingApplicationCommand = {
  applicantType: unknown;
  organizationName: unknown;
  businessEmail: unknown;
  organizationPhone: unknown;
  contactFullName: unknown;
  contactRole: unknown;
  streetAddress: unknown;
  city: unknown;
  state: unknown;
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
  ) {}

  async execute(command: CreateOnboardingApplicationCommand) {
    const details = validateApplicationDetails(command);
    await this.assertEmailIsFree(details.businessEmail);

    const now = new Date();
    const token = generateApplicationToken();
    const application: StoredOnboardingApplication = {
      id: this.idGenerator.generate(),
      reference: generateApplicationReference(),
      tokenHash: hashApplicationToken(token),
      ...details,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: 'draft',
      submittedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      tenantId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.applications.save(application);

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
  };
}
