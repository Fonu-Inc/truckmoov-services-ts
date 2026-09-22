import type { OnboardingApplicationStatus } from './onboarding-application.repository';

export const ONBOARDING_STAGES = [
  'application',
  'provisioning',
  'payment',
  'installation_scheduling',
  'installation',
  'connectivity_verification',
  'fleet_ready',
] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

/**
 * Where an onboarding has reached, as distinct from what was decided about it.
 *
 * `status` answers "did we accept this application"; the stage answers "how far
 * along is this customer". They were one column while the flow ended at
 * approval. They cannot stay one now that approval is the middle of the
 * journey rather than the end of it.
 */
export const STAGE_ORDER: Record<OnboardingStage, number> = {
  application: 0,
  provisioning: 1,
  payment: 2,
  installation_scheduling: 3,
  installation: 4,
  connectivity_verification: 5,
  fleet_ready: 6,
};

/**
 * Stages only ever move forward, one step at a time.
 *
 * A skipped stage is a bug that is invisible afterwards: an onboarding sitting
 * in `installation` with no payment recorded looks identical to one that was
 * paid for. Refusing the jump is what keeps the trail honest.
 */
export function canAdvanceTo(
  current: OnboardingStage,
  next: OnboardingStage,
): boolean {
  return STAGE_ORDER[next] === STAGE_ORDER[current] + 1;
}

export function assertStageAdvance(
  current: OnboardingStage,
  next: OnboardingStage,
): void {
  if (!canAdvanceTo(current, next)) {
    throw new InvalidStageTransitionError(current, next);
  }
}

export class InvalidStageTransitionError extends Error {
  constructor(
    readonly from: OnboardingStage,
    readonly to: OnboardingStage,
  ) {
    super(`An onboarding cannot move from ${from} to ${to}`);
    this.name = 'InvalidStageTransitionError';
  }
}

export type StageProgress = {
  stage: OnboardingStage;
  complete: boolean;
  current: boolean;
};

export function stageProgress(current: OnboardingStage): StageProgress[] {
  return ONBOARDING_STAGES.map((stage) => ({
    stage,
    complete: STAGE_ORDER[stage] < STAGE_ORDER[current],
    current: stage === current,
  }));
}

/**
 * The label the admin queue shows beside the stage.
 *
 * Derived rather than stored: a status that is written separately from the
 * thing it describes is a status that eventually disagrees with it.
 */
export function stageStatusLabel(
  stage: OnboardingStage,
  status: OnboardingApplicationStatus,
): string {
  if (stage === 'application') {
    switch (status) {
      case 'submitted':
        return 'Submitted';
      case 'under_review':
        return 'Attention Needed';
      case 'changes_requested':
        return 'Changes Requested';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Draft';
    }
  }

  switch (stage) {
    case 'provisioning':
      return 'Processing';
    case 'payment':
      return 'Awaiting Payment';
    case 'installation_scheduling':
      return 'Awaiting Scheduling';
    case 'installation':
      return 'In Progress';
    case 'connectivity_verification':
      return 'Processing';
    case 'fleet_ready':
      return 'Fleet Ready';
  }
}
