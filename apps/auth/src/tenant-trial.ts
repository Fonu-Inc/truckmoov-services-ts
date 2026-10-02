import type { StoredTenantTrial } from './tenant-trial.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_TRIAL_EXTENSION_DAYS = 365;

export type TenantTrialView = {
  startedAt: string;
  endsAt: string;
  daysRemaining: number;
  expired: boolean;
  extendedCount: number;
  converted: boolean;
  convertedAt: string | null;
  convertedPlanCode: string | null;
};

export function trialEndsAfter(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** Whole days left, rounded up so the last partial day still counts as a day. */
export function toTrialView(trial: StoredTenantTrial, now: Date): TenantTrialView {
  const msLeft = trial.trialEndsAt.getTime() - now.getTime();
  return {
    startedAt: trial.startedAt.toISOString(),
    endsAt: trial.trialEndsAt.toISOString(),
    daysRemaining: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    expired: msLeft <= 0,
    extendedCount: trial.extendedCount,
    converted: trial.convertedAt !== null,
    convertedAt: trial.convertedAt?.toISOString() ?? null,
    convertedPlanCode: trial.convertedPlanCode,
  };
}
