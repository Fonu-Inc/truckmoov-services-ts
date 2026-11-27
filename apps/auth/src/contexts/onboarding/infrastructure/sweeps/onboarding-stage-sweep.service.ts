import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { runIfLockFree } from '@shared/db';
import { sweepSafely } from '@shared/observability';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { OnboardingProvisioningService } from '@auth/onboarding/application/services/onboarding-provisioning.service';
import { PlatformAlertPublisher } from '../../../../platform-alert.publisher';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 15 * 60 * 1000;
const SETUP_LINK_GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
export const ONBOARDING_STAGE_SWEEP_LOCK_ID = 8_246_113_070_021;

type SweepSummary = { advanced: number; remindedSetupLinks: number };
const EMPTY_SWEEP: SweepSummary = { advanced: 0, remindedSetupLinks: 0 };

/**
 * Daily housekeeping for onboardings that wait on something outside the
 * applicant's hands.
 *
 * Two things stall quietly: an application held at provisioning for device
 * stock that has since arrived, and an installation-stage application whose
 * setup email never went out. The first is advanced; the second is raised to
 * staff each day until someone resends the link.
 */
@Injectable()
export class OnboardingStageSweepService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OnboardingStageSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(OnboardingProvisioningService)
    private readonly provisioning: OnboardingProvisioningService,
    @Inject(PlatformAlertPublisher)
    private readonly alerts: PlatformAlertPublisher,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const run = () =>
      sweepSafely(this.logger, 'onboarding_stage', () => this.run());
    this.firstRun = setTimeout(run, FIRST_SWEEP_DELAY_MS);
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(now: Date = new Date()): Promise<SweepSummary> {
    if (this.running) return EMPTY_SWEEP;
    this.running = true;

    try {
      return await this.exclusively(() => this.sweep(now));
    } finally {
      this.running = false;
    }
  }

  private async exclusively(
    task: () => Promise<SweepSummary>,
  ): Promise<SweepSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();

    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, ONBOARDING_STAGE_SWEEP_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY_SWEEP;
  }

  private async sweep(now: Date): Promise<SweepSummary> {
    const advanced = await this.advanceStocked(now);
    const remindedSetupLinks = await this.remindFailedSetupLinks(now);
    if (advanced > 0 || remindedSetupLinks > 0) {
      this.logger.log(
        `onboarding_stage_sweep:advanced=${advanced}:reminded=${remindedSetupLinks}`,
      );
    }
    return { advanced, remindedSetupLinks };
  }

  private async advanceStocked(now: Date): Promise<number> {
    const waiting = await this.applications.findApprovedAtStage(
      'provisioning',
      BATCH_SIZE,
    );
    let advanced = 0;
    for (const application of waiting) {
      if (await this.advanceOne(application, now)) advanced += 1;
    }
    return advanced;
  }

  private async advanceOne(
    application: StoredOnboardingApplication,
    now: Date,
  ): Promise<boolean> {
    try {
      if (!(await this.provisioning.stockCovers(application))) return false;
      return (await this.provisioning.openPayment(application, now)) !== null;
    } catch (error) {
      this.logger.warn(
        `onboarding_stage_advance_failed:${application.reference}:${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return false;
    }
  }

  private async remindFailedSetupLinks(now: Date): Promise<number> {
    const failed = await this.applications.findSetupLinkFailed(
      new Date(now.getTime() - SETUP_LINK_GRACE_MS),
      BATCH_SIZE,
    );
    for (const application of failed) {
      await this.alerts.raise({
        alertType: 'installation_issues',
        severity: 'medium',
        subject: `Setup email still undelivered (${application.reference})`,
        body: `The account setup email for ${application.organizationName} failed more than 24 hours ago and the applicant cannot sign in. Resend the setup link from the application page.`,
        context: {
          applicationId: application.id,
          reference: application.reference,
          error: application.setupLinkError,
          attempts: application.setupLinkAttempts,
        },
      });
    }
    return failed.length;
  }
}
