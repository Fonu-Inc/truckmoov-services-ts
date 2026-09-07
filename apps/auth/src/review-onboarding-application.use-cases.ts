import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
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
} from './onboarding-application.repository';
import { ApplicationNotFoundError } from './onboarding-application.support';

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
      page: filters.page,
      limit: filters.limit,
    };
    const { items, total } = await this.applications.findForReview(queueFilters);

    // The review screen groups by organisation and shows a document count on
    // each header, so the count is fetched with the row rather than leaving
    // the client to open every application to find out.
    const withCounts = await Promise.all(
      items.map(async (application) => ({
        ...summarize(application),
        documentCount: (await this.applications.findDocumentsByApplicationId(application.id))
          .length,
      })),
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
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string, applicationId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);

    const application = await this.applications.findById(applicationId);
    if (!application) throw new ApplicationNotFoundError();

    const documents =
      await this.applications.findDocumentsByApplicationId(application.id);

    return {
      status: true,
      message: 'success',
      data: {
        ...summarize(application),
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
  const candidate = value?.trim();
  return candidate &&
    (ONBOARDING_APPLICATION_STATUSES as readonly string[]).includes(candidate)
    ? (candidate as OnboardingApplicationStatus)
    : undefined;
}

function asApplicantType(value?: string): OnboardingApplicantType | undefined {
  const candidate = value?.trim();
  return candidate &&
    (ONBOARDING_APPLICANT_TYPES as readonly string[]).includes(candidate)
    ? (candidate as OnboardingApplicantType)
    : undefined;
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
