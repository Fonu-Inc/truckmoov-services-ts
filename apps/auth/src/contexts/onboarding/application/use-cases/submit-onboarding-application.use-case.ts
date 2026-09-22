import { Inject, Injectable } from '@nestjs/common';
import {
  INDEMNITY_AGREEMENT_REPOSITORY,
  type IndemnityAgreementRepository,
} from '@auth/onboarding/domain/indemnity-agreement.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  assertApplicationEditable,
  missingDocumentTypes,
  requestedDeviceCount,
  vehiclesMissingDocuments,
} from '@auth/onboarding/domain/onboarding-application.support';
import { loadApplicationView } from './support/load-application-view';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

export class ApplicationIncompleteError extends Error {
  constructor(
    message: string,
    readonly details: {
      emailVerified: boolean;
      phoneVerified: boolean;
      missingDocuments: string[];
      vehiclesMissingDocuments: { vehicleId: string; registrationNumber: string; documentType: string }[];
      vehicleCount: number;
      requestedDevices: number;
      indemnitySigned: boolean;
      planSelected: boolean;
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
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    assertApplicationEditable(application);

    const [documents, vehicles, deviceRequests, signature] = await Promise.all([
      this.applications.findDocumentsByApplicationId(application.id),
      this.applications.findVehiclesByApplicationId(application.id),
      this.applications.findDeviceRequestsByApplicationId(application.id),
      this.agreements.findSignatureByApplicationId(application.id),
    ]);
    this.assertComplete(application, {
      missingDocuments: missingDocumentTypes(
        application.applicantType,
        documents,
      ),
      vehiclesMissing: vehiclesMissingDocuments(
        application.applicantType,
        vehicles,
        documents,
      ),
      vehicleCount: vehicles.length,
      requestedDevices: requestedDeviceCount(deviceRequests),
      indemnitySigned: signature !== null,
      planSelected: application.m2mPlanCode !== null,
    });

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
      data: await loadApplicationView(this.applications, submitted),
    };
  }

  private assertComplete(
    application: StoredOnboardingApplication,
    fleet: {
      missingDocuments: string[];
      vehiclesMissing: {
        vehicleId: string;
        registrationNumber: string;
        documentType: string;
      }[];
      vehicleCount: number;
      requestedDevices: number;
      indemnitySigned: boolean;
      planSelected: boolean;
    },
  ): void {
    const emailVerified = application.emailVerifiedAt !== null;
    const phoneVerified = application.phoneVerifiedAt !== null;

    const reasons: string[] = [];
    if (!emailVerified) reasons.push('the business email is not verified');
    if (!phoneVerified) reasons.push('the phone number is not verified');
    if (!fleet.planSelected) reasons.push('no M2M licence plan was chosen');
    if (!fleet.indemnitySigned) {
      reasons.push('the indemnity agreement is not signed');
    }
    if (fleet.vehicleCount === 0) reasons.push('no vehicles have been added');
    if (fleet.missingDocuments.length > 0) {
      reasons.push(
        `${fleet.missingDocuments.length} required document(s) are missing`,
      );
    }
    if (fleet.vehiclesMissing.length > 0) {
      reasons.push(
        `${fleet.vehiclesMissing.length} vehicle document(s) are missing`,
      );
    }
    // Every device is fitted to one vehicle, so a request beyond the fleet on
    // the application has nowhere to go at installation.
    if (fleet.requestedDevices > fleet.vehicleCount) {
      reasons.push(
        `${fleet.requestedDevices} devices were requested for ${fleet.vehicleCount} vehicle(s)`,
      );
    }
    if (reasons.length === 0) return;

    throw new ApplicationIncompleteError(
      `This application cannot be submitted yet: ${reasons.join(', ')}`,
      {
        emailVerified,
        phoneVerified,
        missingDocuments: fleet.missingDocuments,
        vehiclesMissingDocuments: fleet.vehiclesMissing,
        vehicleCount: fleet.vehicleCount,
        requestedDevices: fleet.requestedDevices,
        indemnitySigned: fleet.indemnitySigned,
        planSelected: fleet.planSelected,
      },
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
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
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
            complete:
              submitted &&
              missingDocumentTypes(application.applicantType, documents)
                .length === 0,
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
