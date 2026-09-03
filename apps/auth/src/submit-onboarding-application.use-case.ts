import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from './onboarding-application.repository';
import {
  assertApplicationEditable,
  missingDocumentTypes,
  toApplicationView,
} from './onboarding-application.support';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

export class ApplicationIncompleteError extends Error {
  constructor(
    message: string,
    readonly details: {
      emailVerified: boolean;
      phoneVerified: boolean;
      missingDocuments: string[];
    },
  ) {
    super(message);
    this.name = 'ApplicationIncompleteError';
  }
}

@Injectable()
export class SubmitOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    assertApplicationEditable(application);

    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );
    this.assertComplete(application, missingDocumentTypes(documents));

    const now = new Date();
    const submitted: StoredOnboardingApplication = {
      ...application,
      status: 'submitted',
      submittedAt: now,
      // A resubmission after changes_requested clears the previous decision so
      // the queue does not show a stale rejection reason.
      decisionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
    };
    await this.applications.save(submitted);

    return {
      status: true,
      message: 'Application submitted',
      data: toApplicationView(submitted, documents),
    };
  }

  private assertComplete(
    application: StoredOnboardingApplication,
    missingDocuments: string[],
  ): void {
    const emailVerified = application.emailVerifiedAt !== null;
    const phoneVerified = application.phoneVerifiedAt !== null;
    if (emailVerified && phoneVerified && missingDocuments.length === 0) return;

    const reasons: string[] = [];
    if (!emailVerified) reasons.push('the business email is not verified');
    if (!phoneVerified) reasons.push('the phone number is not verified');
    if (missingDocuments.length > 0) {
      reasons.push(`${missingDocuments.length} required document(s) are missing`);
    }

    throw new ApplicationIncompleteError(
      `This application cannot be submitted yet: ${reasons.join(', ')}`,
      { emailVerified, phoneVerified, missingDocuments },
    );
  }
}

@Injectable()
export class GetOnboardingApplicationStatusUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    const submitted = application.submittedAt !== null;
    const decided =
      application.status === 'approved' || application.status === 'rejected';

    return {
      status: true,
      message: 'success',
      data: {
        reference: application.reference,
        applicationStatus: application.status,
        decisionReason: application.decisionReason,
        submittedAt: application.submittedAt?.toISOString() ?? null,
        // Mirrors the timeline on the submitted screen.
        timeline: [
          { key: 'application_submitted', label: 'Application submitted', complete: submitted },
          { key: 'organization_details_received', label: 'Organization details received', complete: submitted },
          {
            key: 'documents_received',
            label: 'Documents received',
            complete: submitted && missingDocumentTypes(documents).length === 0,
          },
          {
            key: 'application_review',
            label: 'Application review',
            complete: decided,
            inProgress: submitted && !decided,
          },
        ],
        documents: documents.map((document) => ({
          documentType: document.documentType,
          status: document.status,
          rejectionReason: document.rejectionReason,
        })),
      },
    };
  }
}
