import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_NOTIFIER,
  INVITE_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '@auth/session';
import type {
  AuthNotifier,
  InviteEmail,
} from '@auth/session/domain/ports/auth-notifier.port';
import type { InviteRepository } from '@auth/session/domain/ports/invite-repository.port';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ORGANIZATION_SETTINGS_REPOSITORY,
  buildDefaultOrganizationSettings,
  type OrganizationSettingsRepository,
} from '@auth/session/domain/ports/organization-settings.repository.port';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import {
  DEFAULT_TENANT_FEATURES,
  ORG_TYPE_TO_BOOTSTRAP_ROLE,
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from '../../../../tenant-onboarding.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicantType,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
  type StoredOnboardingApplicationDocument,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationNotFoundError,
  generateApplicationToken,
  hashApplicationToken,
  missingDocumentTypes,
} from '@auth/onboarding/domain/onboarding-application.support';
import {
  ApplicationNotUnderReviewError,
  DecisionReasonRequiredError,
  REVIEWABLE_STATUSES,
} from './review-onboarding-application.use-cases';
import {
  ONBOARDING_DECISION_NOTIFIER,
  type OnboardingDecisionNotifier,
} from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';
import { BusinessEmailInUseError } from '@auth/onboarding/domain/onboarding-application.support';

// Matches the existing tenant bootstrap invite window.
const SETUP_LINK_TTL_MS = 72 * 60 * 60 * 1000;

export class ApplicationDocumentsIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationDocumentsIncompleteError';
  }
}

export class SetupLinkNotResendableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupLinkNotResendableError';
  }
}

@Injectable()
export class ApproveOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INVITE_REPOSITORY) private readonly invites: InviteRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizations: OrganizationSettingsRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboarding: TenantOnboardingRepository,
    @Inject(AUTH_NOTIFIER) private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: { accessToken: string; applicationId: string }) {
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

    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );
    this.assertDocumentsSettled(application.applicantType, documents);

    // Re-checked at the decision, not only at draft time: an address can be
    // claimed by another route while an application sits in the queue.
    const existingUser = await this.users.findByEmail(application.businessEmail);
    if (existingUser) throw new BusinessEmailInUseError();

    const tenantId = this.idGenerator.generate();
    const inviteToken = this.idGenerator.generate();
    const bootstrapRole = ORG_TYPE_TO_BOOTSTRAP_ROLE[application.applicantType];
    const now = new Date();

    const settings = buildDefaultOrganizationSettings(tenantId);
    settings.branding.organizationName = application.organizationName;
    settings.branding.contactEmail = application.businessEmail;
    settings.branding.phoneNumber = application.organizationPhone;
    settings.branding.address = `${application.streetAddress}, ${application.city}, ${application.state}`;
    await this.organizations.save(settings);

    await this.tenantOnboarding.save({
      id: this.idGenerator.generate(),
      tenantId,
      invitedEmail: application.businessEmail,
      organizationType: application.applicantType,
      bootstrapRole,
      status: 'pending_activation',
      company: {
        companyName: application.organizationName,
        contactName: application.contactFullName,
        email: application.businessEmail,
        phoneNumber: application.organizationPhone,
        billingEmail: null,
        businessAddress: settings.branding.address,
        organizationType: application.applicantType,
      },
      // Nobody chose a plan for this tenant: the applicant selects and pays for
      // one after setting their password, and activation records what they paid
      // for. An empty plan code here is the honest state, not a placeholder.
      subscription: { planCode: '', billingCycle: 'monthly' },
      deviceProvisioning: {
        provisionNow: false,
        numberOfDevices: null,
        deviceManufacturer: null,
        deviceModel: null,
      },
      simAssignment: {
        provisionNow: false,
        numberOfSims: null,
        carrier: null,
        dataPackage: null,
      },
      features: { ...DEFAULT_TENANT_FEATURES },
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    });

    await this.invites.save({
      id: this.idGenerator.generate(),
      email: application.businessEmail,
      role: bootstrapRole,
      tenantId,
      token: inviteToken,
      invitedBy: actor.id,
      status: 'pending',
      expiresAt: new Date(now.getTime() + SETUP_LINK_TTL_MS),
      createdAt: now,
    });

    // Ownership of the paperwork moves by column. The files themselves stay in
    // the platform's storage prefix for life.
    await this.applications.assignDocumentsToTenant(application.id, tenantId);

    const approved: StoredOnboardingApplication = {
      ...application,
      status: 'approved',
      tenantId,
      reviewedBy: actor.id,
      reviewedAt: now,
      decisionReason: null,
      updatedAt: now,
    };
    await this.applications.save(approved);

    const delivery = await deliverSetupLink(this.applications, this.notifier, approved, {
      email: application.businessEmail,
      role: bootstrapRole,
      inviteToken,
    });

    return {
      status: true,
      message: delivery.delivered
        ? 'Application approved and setup link sent'
        : 'Application approved, but the setup link could not be delivered',
      data: {
        applicationId: approved.id,
        reference: approved.reference,
        status: approved.status,
        tenantId,
        bootstrapRole,
        setupLinkEmail: application.businessEmail,
        setupLinkExpiresAt: new Date(
          now.getTime() + SETUP_LINK_TTL_MS,
        ).toISOString(),
        setupLinkStatus: delivery.status,
        setupLinkError: delivery.error,
      },
    };
  }

  private assertDocumentsSettled(
    applicantType: OnboardingApplicantType,
    documents: StoredOnboardingApplicationDocument[],
  ): void {
    const missing = missingDocumentTypes(applicantType, documents);
    if (missing.length > 0) {
      throw new ApplicationDocumentsIncompleteError(
        `${missing.length} required document(s) are missing`,
      );
    }
    const rejected = documents.filter(
      (document) => document.status === 'rejected',
    );
    if (rejected.length > 0) {
      throw new ApplicationDocumentsIncompleteError(
        'Some documents are rejected. Request changes instead of approving.',
      );
    }
  }
}

@Injectable()
export class RejectOnboardingApplicationUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
  ) {}

  async execute(input: {
    accessToken: string;
    applicationId: string;
    reason?: string;
  }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );

    const reason = input.reason?.trim();
    if (!reason) throw new DecisionReasonRequiredError();

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    const now = new Date();
    const rejected: StoredOnboardingApplication = {
      ...application,
      status: 'rejected',
      decisionReason: reason,
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    };
    await this.applications.save(rejected);

    await this.notifier.sendRejected({
      email: application.businessEmail,
      organizationName: application.organizationName,
      reference: application.reference,
      reason,
    });

    return {
      status: true,
      message: 'Application rejected',
      data: {
        applicationId: rejected.id,
        reference: rejected.reference,
        status: rejected.status,
        decisionReason: reason,
      },
    };
  }
}

@Injectable()
export class RequestOnboardingApplicationChangesUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
  ) {}

  async execute(input: {
    accessToken: string;
    applicationId: string;
    reason?: string;
  }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );

    const reason = input.reason?.trim();
    if (!reason) throw new DecisionReasonRequiredError();

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    // The applicant's original token was never stored in the clear, so a fresh
    // one is minted for the resume link. The old one stops working here, which
    // is what we want of a link that has been sitting in an inbox.
    const applicationToken = generateApplicationToken();
    const now = new Date();
    await this.applications.save({
      ...application,
      status: 'changes_requested',
      tokenHash: hashApplicationToken(applicationToken),
      decisionReason: reason,
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    });

    await this.notifier.sendChangesRequested({
      email: application.businessEmail,
      organizationName: application.organizationName,
      reference: application.reference,
      reason,
      applicationId: application.id,
      applicationToken,
    });

    return {
      status: true,
      message: 'Changes requested from the applicant',
      data: {
        applicationId: application.id,
        reference: application.reference,
        status: 'changes_requested',
        decisionReason: reason,
      },
    };
  }
}

@Injectable()
export class ResendOnboardingSetupLinkUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INVITE_REPOSITORY) private readonly invites: InviteRepository,
    @Inject(AUTH_NOTIFIER) private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: { accessToken: string; applicationId: string }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (application.status !== 'approved' || !application.tenantId) {
      throw new SetupLinkNotResendableError(
        'Only an approved application has a setup link',
      );
    }

    const existingUser = await this.users.findByEmail(application.businessEmail);
    if (existingUser) {
      throw new SetupLinkNotResendableError(
        'This account has already been set up. Use password reset instead.',
      );
    }

    const invite = await this.invites.findPendingByEmailForTenant(
      application.tenantId,
      application.businessEmail,
    );
    const now = new Date();
    // Rotated rather than re-sent: a copy of the previous email must stop
    // working the moment a new link is issued.
    const token = this.idGenerator.generate();

    await this.invites.save({
      id: invite?.id ?? this.idGenerator.generate(),
      email: application.businessEmail,
      role: invite?.role ?? ORG_TYPE_TO_BOOTSTRAP_ROLE[application.applicantType],
      tenantId: application.tenantId,
      token,
      invitedBy: actor.id,
      status: 'pending',
      expiresAt: new Date(now.getTime() + SETUP_LINK_TTL_MS),
      createdAt: invite?.createdAt ?? now,
    });

    const delivery = await deliverSetupLink(this.applications, this.notifier, application, {
      email: application.businessEmail,
      role: invite?.role ?? ORG_TYPE_TO_BOOTSTRAP_ROLE[application.applicantType],
      inviteToken: token,
    });

    return {
      status: true,
      message: delivery.delivered
        ? 'Setup link resent'
        : 'The setup link could not be delivered',
      data: {
        applicationId: application.id,
        setupLinkEmail: application.businessEmail,
        setupLinkExpiresAt: new Date(
          now.getTime() + SETUP_LINK_TTL_MS,
        ).toISOString(),
        resentBy: actor.id,
        resentAt: now.toISOString(),
        setupLinkStatus: delivery.status,
        setupLinkError: delivery.error,
      },
    };
  }
}

/**
 * Sends the setup link and records what happened.
 *
 * A failed send must not fail the approval: the decision has been made and
 * written, and the operator can resend. Recording the failure is what puts it
 * on the screen instead of losing it in a log line.
 *
 * "sent" means the transport accepted the message. There is no bounce
 * feedback, so a message accepted and rejected downstream still reads as sent.
 */
async function deliverSetupLink(
  applications: OnboardingApplicationRepository,
  notifier: Pick<AuthNotifier, 'sendTenantInviteEmail'>,
  application: StoredOnboardingApplication,
  invite: InviteEmail,
): Promise<{ delivered: boolean; status: 'sent' | 'failed'; error: string | null }> {
  const attemptedAt = new Date();

  try {
    await notifier.sendTenantInviteEmail(invite);
    await applications.save({
      ...application,
      setupLinkStatus: 'sent',
      setupLinkSentAt: attemptedAt,
      setupLinkError: null,
      setupLinkAttempts: application.setupLinkAttempts + 1,
      updatedAt: attemptedAt,
    });
    return { delivered: true, status: 'sent', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    await applications.save({
      ...application,
      setupLinkStatus: 'failed',
      setupLinkSentAt: attemptedAt,
      setupLinkError: message,
      setupLinkAttempts: application.setupLinkAttempts + 1,
      updatedAt: attemptedAt,
    });
    return { delivered: false, status: 'failed', error: message };
  }
}
