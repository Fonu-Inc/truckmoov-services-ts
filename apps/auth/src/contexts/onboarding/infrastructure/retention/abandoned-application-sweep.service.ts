import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { sweepSafely } from '@shared/observability';
import { ObjectStorageService } from '@shared/object-storage';
import {
  IDENTITY_CLAIM_REPOSITORY,
  type IdentityClaimRepository,
} from '@auth/onboarding/domain/identity-claim.repository';
import {
  INDEMNITY_AGREEMENT_REPOSITORY,
  type IndemnityAgreementRepository,
} from '@auth/onboarding/domain/indemnity-agreement.repository';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  VERIFICATION_RESULT_REPOSITORY,
  type VerificationResultRepository,
} from '@auth/onboarding/domain/verification-result.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 10 * 60 * 1000;
const BATCH_SIZE = 100;

/**
 * Erases applications nobody came back to.
 *
 * An abandoned application holds a verified email and phone, a business
 * address, a contact person's name, uploaded identity documents and a
 * signature image, for a business that never became a customer. Refusing the
 * link at the end of the draft lifetime stops the applicant using it; it does
 * not stop the data sitting there. This is what removes it.
 *
 * The retention window is deliberately longer than the draft lifetime, so
 * "your link expired" and "your application is gone" are not the same moment
 * and support still has a window to recover one.
 *
 * Only applications the applicant could still have acted on are swept.
 * Submitted, approved and rejected applications are business records with
 * their own retention rules and are never touched here.
 */
@Injectable()
export class AbandonedApplicationSweepService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AbandonedApplicationSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
    @Inject(IDENTITY_CLAIM_REPOSITORY)
    private readonly identityClaims: IdentityClaimRepository,
    @Inject(VERIFICATION_RESULT_REPOSITORY)
    private readonly verificationResults: VerificationResultRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY)
    private readonly installationOrders: InstallationOrderRepository,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;

    // Not at the instant of boot: a rolling deploy would otherwise have every
    // replica sweep the same applications at once.
    this.firstRun = setTimeout(
      () =>
        sweepSafely(this.logger, 'abandoned_application', () => this.run()),
      FIRST_SWEEP_DELAY_MS,
    );
    this.timer = setInterval(
      () =>
        sweepSafely(this.logger, 'abandoned_application', () => this.run()),
      SWEEP_INTERVAL_MS,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(now: Date = new Date()): Promise<{ erased: number }> {
    if (this.running) return { erased: 0 };
    this.running = true;

    try {
      const cutoff = new Date(
        now.getTime() - this.config.auth.onboardingRetentionDays * 24 * 60 * 60 * 1000,
      );
      const abandoned = await this.applications.findAbandoned(
        cutoff,
        BATCH_SIZE,
      );

      let erased = 0;
      for (const application of abandoned) {
        if (await this.erase(application)) erased += 1;
      }

      if (erased > 0 || abandoned.length > 0) {
        this.logger.log(
          `abandoned_applications_erased:found=${abandoned.length}:erased=${erased}`,
        );
      }
      return { erased };
    } finally {
      this.running = false;
    }
  }

  private async erase(
    application: StoredOnboardingApplication,
  ): Promise<boolean> {
    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );
    const signature = await this.agreements.findSignatureByApplicationId(
      application.id,
    );

    const keys = documents.map((document) => document.fileKey);
    if (signature) keys.push(signature.fileKey);
    keys.push(...(await this.evidenceKeys(application.id)));

    // Files first, rows second. A row without its file is still a record that
    // says what was there; a file whose row is gone is an orphan nobody can
    // find again to delete, which is the failure that leaves documents behind
    // forever.
    for (const key of keys) {
      try {
        await this.storage.deleteObject(key, 'private');
      } catch (error) {
        this.logger.warn(
          `abandoned_application_file_delete_failed:${application.reference}:${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
        return false;
      }
    }

    await this.agreements.deleteSignatureByApplicationId(application.id);
    // Claims go with the application: an erased application must stop blocking
    // whoever legitimately holds those details next.
    await this.identityClaims.deleteForApplication(application.id);
    await this.verificationResults.deleteForApplication(application.id);
    await this.payments.deleteForApplication(application.id);
    await this.installationOrders.deleteForApplication(application.id);
    await this.applications.deleteApplication(application.id);
    return true;
  }

  private async evidenceKeys(applicationId: string): Promise<string[]> {
    const order = await this.installationOrders.findByApplicationId(applicationId);
    if (!order) return [];
    const evidence = await this.installationOrders.findEvidence(order.id);
    return evidence.map((item) => item.fileKey);
  }
}
