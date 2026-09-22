import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationNotFoundError,
  hashApplicationToken,
  toApplicationView,
} from '@auth/onboarding/domain/onboarding-application.support';

@Injectable()
export class GetOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.resolve(applicationId, applicationToken);
    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    return {
      status: true,
      message: 'success',
      data: toApplicationView(application, documents),
    };
  }

  async resolve(
    applicationId: string,
    applicationToken: string,
  ): Promise<StoredOnboardingApplication> {
    const application = await this.applications.findById(applicationId);
    // A wrong token is reported as a missing application: telling a caller that
    // an id exists but their token is wrong is what makes ids worth guessing.
    if (!application) throw new ApplicationNotFoundError();
    if (application.tokenHash !== hashApplicationToken(applicationToken)) {
      throw new ApplicationNotFoundError();
    }
    return application;
  }
}
