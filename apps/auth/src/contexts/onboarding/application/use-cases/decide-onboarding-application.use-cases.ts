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
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import { sendWithRotatedToken } from '../services/send-with-rotated-token';
import { OnboardingDeviceInventoryService } from '../services/onboarding-device-inventory.service';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from '../../../../subscription-plan.repository';
import {
  TENANT_TRIAL_REPOSITORY,
  type TenantTrialRepository,
} from '../../../../tenant-trial.repository';
import { trialEndsAfter } from '../../../../tenant-trial';
import { TrialDaysResolver } from '../../../../trial-days.resolver';

// Matches the existing tenant bootstrap invite window.
const SETUP_LINK_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Who a decision is attributed to when nobody made it by hand.
 *
 * Recorded as an actor rather than left null so the audit trail always answers
 * "who decided this", and an automated approval is visibly distinguishable
 * from an administrator's.
 */
export const SYSTEM_DECISION_ACTOR_ID = 'system';

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

export const INFORMATION_REQUEST_SECTIONS = [
  'business_details',
  'fleet_requirements',
  'submitted_documents',
] as const;
export type InformationRequestSection = (typeof INFORMATION_REQUEST_SECTIONS)[number];

function informationRequestSection(value: unknown): InformationRequestSection {
  if (!(INFORMATION_REQUEST_SECTIONS as readonly unknown[]).includes(value)) {
    throw new DecisionReasonRequiredError();
  }
  return value as InformationRequestSection;
}

export const CHANGES_EMAIL_FAILED_MESSAGE =
  'Status updated but the email could not be sent: use Resend';

export function sendChangesRequestedLink(
  applications: OnboardingApplicationRepository,
  notifier: OnboardingDecisionNotifier,
  application: StoredOnboardingApplication,
  reason: string,
) {
  return sendWithRotatedToken(applications, application.id, (token) =>
    notifier.sendChangesRequested({
      email: application.businessEmail,
      organizationName: application.organizationName,
      reference: application.reference,
      reason,
      applicationId: application.id,
      applicationToken: token,
    }),
  );
}

const INFORMATION_REQUEST_SECTION_LABEL: Record<InformationRequestSection, string> = {
  business_details: 'Business details',
  fleet_requirements: 'Fleet requirements',
  submitted_documents: 'Submitted documents',
};

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
    @Inject(OnboardingDeviceInventoryService)
    private readonly inventory: OnboardingDeviceInventoryService,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly subscriptionPlans: SubscriptionPlanRepository,
    @Inject(TENANT_TRIAL_REPOSITORY)
    private readonly trials: TenantTrialRepository,
    @Inject(TrialDaysResolver)
    private readonly trialDaysResolver: TrialDaysResolver,
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

    return this.approve(application, actor.id);
  }

  /**
   * Approval reached by the registry checks rather than by a reviewer.
   *
   * The per-document review is skipped because nobody performed one: the
   * evidence is the stored verification results, not a reviewer's ticks. The
   * email-in-use re-check is not skipped, because that race is the same
   * whoever decides.
   */
  async executeAsSystem(applicationId: string) {
    const application = await this.applications.findById(applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    return this.approve(application, SYSTEM_DECISION_ACTOR_ID);
  }

  private async approve(
    application: StoredOnboardingApplication,
    actorId: string,
  ) {
    // Re-checked at the decision, not only at draft time: an address can be
    // claimed by another route while an application sits in the queue.
    const existingUser = await this.users.findByEmail(application.businessEmail);
    if (existingUser) throw new BusinessEmailInUseError();

    const tenantId = this.idGenerator.generate();
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
      createdByUserId: actorId,
      createdAt: now,
      updatedAt: now,
    });

    // Ownership of the paperwork moves by column. The files themselves stay in
    // the platform's storage prefix for life.
    await this.applications.assignDocumentsToTenant(application.id, tenantId);

    const deviceRequests = await this.applications.findDeviceRequestsByApplicationId(application.id);
    const stock = await this.inventory.availability();
    const allocationCanProceed =
      !stock.tracked || requestedDeviceCount(deviceRequests) <= stock.availableQuantity;
    const approved: StoredOnboardingApplication = {
      ...application,
      status: 'approved',
      // A provisioned request moves itself forward. When stock changed after
      // the customer accepted the disclosed amount, it remains at Provisioning
      // for the inventory sweep rather than allowing a manual UI switch.
      stage: allocationCanProceed ? 'payment' : 'provisioning',
      tenantId,
      reviewedBy: actorId,
      reviewedAt: now,
      decisionReason: null,
      updatedAt: now,
    };
    await this.applications.save(approved);
    await this.startTrial(tenantId, now);

    return {
      status: true,
      // No setup link yet: the account is created when an installation is
      // booked, which is the first moment there is anything to log in and see.
      message: allocationCanProceed
        ? 'Application approved, awaiting payment'
        : 'Application approved, awaiting inventory availability',
      data: {
        applicationId: approved.id,
        reference: approved.reference,
        status: approved.status,
        stage: approved.stage,
        tenantId,
        bootstrapRole,
      },
    };
  }

  /**
   * Self-serve tenants get the same trial an admin-created tenant gets from
   * its plan. The licence an applicant buys carries no trial; the starter
   * subscription plan, which every new tenant begins on, does. See
   * TrialDaysResolver for the order the length is decided in.
   */
  private async startTrial(tenantId: string, now: Date): Promise<void> {
    const starter = await this.subscriptionPlans.findByTier('starter');
    const trialDays = await this.trialDaysResolver.resolve(starter);
    if (!trialDays || trialDays <= 0) return;
    await this.trials.startIfAbsent(tenantId, now, trialEndsAfter(now, trialDays));
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

    return this.reject(input.applicationId, reason, actor.id);
  }

  /** Rejection reached by the registry checks rather than by a reviewer. */
  async executeAsSystem(applicationId: string, reason: string) {
    return this.reject(applicationId, reason, SYSTEM_DECISION_ACTOR_ID);
  }

  private async reject(
    applicationId: string,
    reason: string,
    actorId: string,
  ) {
    const application = await this.applications.findById(applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    const now = new Date();
    const rejected: StoredOnboardingApplication = {
      ...application,
      status: 'rejected',
      decisionReason: reason,
      reviewedBy: actorId,
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
    section?: unknown;
  }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );

    const reason = input.reason?.trim();
    if (!reason) throw new DecisionReasonRequiredError();
    const section = informationRequestSection(input.section ?? 'submitted_documents');
    const sectionedReason = `${INFORMATION_REQUEST_SECTION_LABEL[section]}: ${reason}`;

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (!REVIEWABLE_STATUSES.includes(application.status)) {
      throw new ApplicationNotUnderReviewError(application.status);
    }

    const now = new Date();
    await this.applications.save({
      ...application,
      status: 'changes_requested',
      decisionReason: sectionedReason,
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    });

    const delivery = await sendChangesRequestedLink(
      this.applications,
      this.notifier,
      application,
      sectionedReason,
    );

    return {
      status: true,
      message: delivery.delivered
        ? 'Changes requested from the applicant'
        : CHANGES_EMAIL_FAILED_MESSAGE,
      data: {
        delivered: delivery.delivered,
        applicationId: application.id,
        reference: application.reference,
        status: 'changes_requested',
        decisionReason: sectionedReason,
        section,
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
