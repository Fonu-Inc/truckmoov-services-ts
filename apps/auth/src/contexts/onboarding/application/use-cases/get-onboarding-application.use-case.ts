import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationNotFoundError,
  hashApplicationToken,
  isDraftExpired,
} from '@auth/onboarding/domain/onboarding-application.support';
import { loadApplicationView } from './support/load-application-view';

@Injectable()
export class GetOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.resolve(applicationId, applicationToken);

    return {
      status: true,
      message: 'success',
      data: await loadApplicationView(this.applications, application),
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
    const presented = hashApplicationToken(applicationToken);
    if (application.tokenHash !== presented && application.previousTokenHash !== presented) {
      throw new ApplicationNotFoundError();
    }
    // An abandoned draft reads as gone rather than as a locked application:
    // there is nothing the applicant can do with it, and the next step is to
    // start again, not to ask support to unlock it.
    if (isDraftExpired(application)) throw new ApplicationNotFoundError();
    return application;
  }
}
