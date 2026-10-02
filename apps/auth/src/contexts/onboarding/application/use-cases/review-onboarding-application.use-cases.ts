import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import { positiveInt } from './support/queue-paging';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_APPLICANT_TYPES,
  type OnboardingApplicantType,
  type OnboardingApplicationQueueFilters,
  type OnboardingApplicationRepository,
  type OnboardingApplicationStatus,
  type StoredOnboardingApplication,
  type StoredOnboardingApplicationDocument,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationNotFoundError,
  requestedDeviceCount,
} from '@auth/onboarding/domain/onboarding-application.support';
import {
  stageProgress,
  stageStatusLabel,
} from '@auth/onboarding/domain/onboarding-stage';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { toPaymentReviewViews } from './review-onboarding-payment.use-case';
import {
  VERIFICATION_RESULT_REPOSITORY,
  type VerificationResultRepository,
} from '@auth/onboarding/domain/verification-result.repository';

const DOWNLOAD_URL_TTL_SECONDS = 300;

export class ApplicationNotUnderReviewError extends Error {
  constructor(status: string) {
    super(`An application in ${status} state cannot be reviewed`);
    this.name = 'ApplicationNotUnderReviewError';
  }
}

export class DecisionReasonRequiredError extends Error {
  constructor() {
    super('A reason is required');
    this.name = 'DecisionReasonRequiredError';
  }
}

export class ApplicationDocumentNotFoundError extends Error {
  constructor() {
    super('Application document not found');
    this.name = 'ApplicationDocumentNotFoundError';
  }
}

export const REVIEWABLE_STATUSES: OnboardingApplicationStatus[] = [
  'submitted',
  'under_review',
];

function summarize(application: StoredOnboardingApplication) {
  return {
    id: application.id,
    reference: application.reference,
    applicantType: application.applicantType,
    organizationName: application.organizationName,
    businessEmail: application.businessEmail,
    organizationPhone: application.organizationPhone,
    contactFullName: application.contactFullName,
    contactRole: application.contactRole,
    address: `${application.streetAddress}, ${application.city}, ${application.state}`,
    status: application.status,
    stage: application.stage,
    // The queue shows a stage and a label beside it. The label is derived from
    // the pair rather than stored, so it cannot drift from the stage it
    // describes.
    stageStatus: stageStatusLabel(application.stage, application.status),
    emailVerified: application.emailVerifiedAt !== null,
    phoneVerified: application.phoneVerifiedAt !== null,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    reviewedBy: application.reviewedBy,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    decisionReason: application.decisionReason,
    tenantId: application.tenantId,
    // Whether the setup link reached them. Null before an approval, `failed`
    // when the last send was rejected, which is what puts the retry row on the
    // review screen.
    setupLink: {
      status: application.setupLinkStatus,
      sentAt: application.setupLinkSentAt?.toISOString() ?? null,
      error: application.setupLinkError,
      attempts: application.setupLinkAttempts,
    },
    createdAt: application.createdAt.toISOString(),
  };
}

@Injectable()
export class ListOnboardingApplicationsUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(
    accessToken: string,
    filters: {
      status?: string;
      applicantType?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);

    const queueFilters: OnboardingApplicationQueueFilters = {
      status: asStatus(filters.status),
      applicantType: asApplicantType(filters.applicantType),
      search: filters.search,
      page: positiveInt(filters.page),
      limit: positiveInt(filters.limit),
    };
    const { items, total } = await this.applications.findForReview(queueFilters);

    // The review screen groups by organisation and shows a document count on
    // each header, so the count is fetched with the row rather than leaving
    // the client to open every application to find out.
    const withCounts = await Promise.all(
      items.map(async (application) => {
        const [documents, vehicles, deviceRequests] = await Promise.all([
          this.applications.findDocumentsByApplicationId(application.id),
          this.applications.findVehiclesByApplicationId(application.id),
          this.applications.findDeviceRequestsByApplicationId(application.id),
        ]);

        return {
          ...summarize(application),
          documentCount: documents.length,
          vehicleCount: vehicles.length,
          deviceCount: requestedDeviceCount(deviceRequests),
        };
      }),
    );

    return {
      status: true,
      message: 'success',
      data: {
        items: withCounts,
        total,
        page: filters.page ?? 1,
        limit: filters.limit ?? 50,
      },
    };
  }
}

@Injectable()
export class GetOnboardingApplicationForReviewUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ObjectStorageService)
    private readonly objectStorage: ObjectStorageService,
    @Inject(VERIFICATION_RESULT_REPOSITORY)
    private readonly verificationResults: VerificationResultRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
  ) {}

  async execute(accessToken: string, applicationId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);

    const application = await this.applications.findById(applicationId);
    if (!application) throw new ApplicationNotFoundError();

    const [documents, vehicles, deviceRequests, verifications, reviewablePayments] =
      await Promise.all([
        this.applications.findDocumentsByApplicationId(application.id),
        this.applications.findVehiclesByApplicationId(application.id),
        this.applications.findDeviceRequestsByApplicationId(application.id),
        this.verificationResults.findByApplicationId(application.id),
        this.payments.listMismatchedForApplication(application.id, true),
      ]);

    const paymentReviews = toPaymentReviewViews(reviewablePayments);

    return {
      status: true,
      message: 'success',
      data: {
        ...summarize(application),
        progress: stageProgress(application.stage),
        paymentReview: paymentReviews[0] ?? null,
        paymentReviews,
        vehicleCount: vehicles.length,
        deviceCount: requestedDeviceCount(deviceRequests),
        vehicles: vehicles.map((vehicle) => ({
          id: vehicle.id,
          registrationNumber: vehicle.registrationNumber,
          vehicleType: vehicle.vehicleType,
          make: vehicle.make,
          model: vehicle.model,
        })),
        deviceRequests: deviceRequests.map((request) => ({
          id: request.id,
          quantity: request.quantity,
          useCase: request.useCase,
        })),
        // What each registry answered, so a reviewer looking at an application
        // the checks could not settle sees why without leaving the screen.
        verifications: verifications.map((result) => ({
          check: result.check,
          verdict: result.verdict,
          summary: result.summary,
          fields: result.fields,
          provider: result.provider,
          checkedAt: result.checkedAt.toISOString(),
        })),
        documents: await Promise.all(
          documents.map(async (document) => ({
            id: document.id,
            documentType: document.documentType,
            documentName: document.documentName,
            fileSize: document.fileSize,
            mimeType: document.mimeType,
            status: document.status,
            rejectionReason: document.rejectionReason,
            reviewedBy: document.reviewedBy,
            reviewedAt: document.reviewedAt?.toISOString() ?? null,
            uploadedAt: document.createdAt.toISOString(),
            // Short-lived and generated per request: these are identity
            // documents, so no durable link to them is ever handed out.
            downloadUrl: await this.presign(document),
          })),
        ),
      },
    };
  }

  private async presign(
    document: StoredOnboardingApplicationDocument,
  ): Promise<string | null> {
    try {
      return await this.objectStorage.createPresignedDownloadUrl({
        key: document.fileKey,
        expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      });
    } catch {
      return null;
    }
  }
}

@Injectable()
export class ReviewOnboardingApplicationDocumentUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    applicationId: string;
    documentId: string;
    decision: 'approved' | 'rejected';
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
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    const document = await this.applications.findDocumentById(input.documentId);
    if (!document || document.applicationId !== application.id) {
      throw new ApplicationDocumentNotFoundError();
    }

    const reason = input.reason?.trim();
    if (input.decision === 'rejected' && !reason) {
      throw new DecisionReasonRequiredError();
    }

    const now = new Date();
    await this.applications.saveDocument({
      ...document,
      status: input.decision,
      rejectionReason: input.decision === 'rejected' ? (reason ?? null) : null,
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    });

    if (application.status === 'submitted') {
      await this.applications.save({
        ...application,
        status: 'under_review',
        updatedAt: now,
      });
    }

    return {
      status: true,
      message:
        input.decision === 'approved' ? 'Document approved' : 'Document rejected',
      data: { documentId: document.id, status: input.decision },
    };
  }
}

function asStatus(value?: string): OnboardingApplicationStatus | undefined {
  return oneOf(value, ONBOARDING_APPLICATION_STATUSES, 'status');
}

function asApplicantType(value?: string): OnboardingApplicantType | undefined {
  return oneOf(value, ONBOARDING_APPLICANT_TYPES, 'applicantType');
}

/** A filter value outside the list is refused: ignoring it lists everything while reading as filtered. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], field: string): T | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if ((allowed as readonly string[]).includes(candidate)) return candidate as T;
  throw new OnboardingValidationError(field, `${field} must be one of: ${allowed.join(', ')}`);
}

/** The four cards above the KYC review queue. */
@Injectable()
export class GetOnboardingReviewSummaryUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);

    // A high limit rather than a count query: the queue is small by nature,
    // and an application nobody has decided on does not stay in it for long.
    const { items } = await this.applications.findForReview({ limit: 1000 });

    const countOf = (...statuses: string[]) =>
      items.filter((application) => statuses.includes(application.status)).length;

    return {
      status: true,
      message: 'success',
      data: {
        total: items.length,
        // Submitted and under review are both waiting on the platform; the
        // screen makes no distinction between them.
        pendingReview: countOf('submitted', 'under_review'),
        approved: countOf('approved'),
        rejected: countOf('rejected'),
        changesRequested: countOf('changes_requested'),
      },
    };
  }
}
