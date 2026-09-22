import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AutomatedDecision } from '@auth/onboarding/domain/automated-decision';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApproveOnboardingApplicationUseCase,
  RejectOnboardingApplicationUseCase,
} from './decide-onboarding-application.use-cases';
import { VerifyApplicationAutomaticallyUseCase } from './verify-application-automatically.use-case';

@Injectable()
export class ApplyAutomatedDecisionUseCase {
  private readonly logger = new Logger(ApplyAutomatedDecisionUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(VerifyApplicationAutomaticallyUseCase)
    private readonly verify: VerifyApplicationAutomaticallyUseCase,
    @Inject(ApproveOnboardingApplicationUseCase)
    private readonly approve: ApproveOnboardingApplicationUseCase,
    @Inject(RejectOnboardingApplicationUseCase)
    private readonly reject: RejectOnboardingApplicationUseCase,
  ) {}

  /**
   * Runs the registry checks on a freshly submitted application and acts on
   * what they say.
   *
   * Anything short of a clean pass lands in `under_review`, which is the
   * queue an administrator works. That is the safe direction: a person looking
   * at an application that did not need it costs a few minutes, and an
   * automatic approval that should not have happened costs an account.
   *
   * A failure here never fails the submission. The applicant has finished
   * their part; an outage on our side is our problem to work through, so it
   * leaves the application in review rather than throwing the submit away.
   */
  async execute(
    application: StoredOnboardingApplication,
  ): Promise<AutomatedDecision> {
    try {
      const { decision } = await this.verify.execute(application);

      if (decision.outcome === 'approve') {
        await this.approve.executeAsSystem(application.id);
        return decision;
      }
      if (decision.outcome === 'reject') {
        await this.reject.executeAsSystem(application.id, decision.reason);
        return decision;
      }

      await this.markUnderReview(application, decision.reason);
      return decision;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Automated checks failed';
      this.logger.error(
        `automated_decision_failed:${application.reference}:${reason}`,
      );
      await this.markUnderReview(application, 'Automated checks could not be completed.');
      return { outcome: 'manual_review', reason };
    }
  }

  private async markUnderReview(
    application: StoredOnboardingApplication,
    reason: string,
  ): Promise<void> {
    const current = await this.applications.findById(application.id);
    // A decision may already have landed by another route while the checks
    // ran; only a still-submitted application is moved into the queue.
    if (!current || current.status !== 'submitted') return;

    await this.applications.save({
      ...current,
      status: 'under_review',
      // Held on the application so the queue can show why a person is needed,
      // without a reviewer having to open the verification results first.
      decisionReason: reason,
      updatedAt: new Date(),
    });
  }
}
