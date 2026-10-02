export type EnforcementSettings = {
  graceDays: number;
  renewalLeadDays: number;
  autoSuspendEnabled: boolean;
  autoSuspendCapPerRun: number;
  paused: boolean;
  /** Trial length for self-serve tenants; null follows the starter plan. */
  onboardingTrialDaysOverride: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EnforcementSettingsPatch = Partial<
  Pick<EnforcementSettings, 'graceDays' | 'renewalLeadDays' | 'autoSuspendEnabled' | 'autoSuspendCapPerRun' | 'paused' | 'onboardingTrialDaysOverride'>
>;

export const ENFORCEMENT_LIMITS = {
  graceDays: { min: 0, max: 30 },
  renewalLeadDays: { min: 1, max: 60 },
  autoSuspendCapPerRun: { min: 1, max: 200 },
  onboardingTrialDaysOverride: { min: 1, max: 90 },
} as const;

export const DEFAULT_ENFORCEMENT_SETTINGS: EnforcementSettings = {
  graceDays: 3,
  renewalLeadDays: 7,
  autoSuspendEnabled: false,
  autoSuspendCapPerRun: 10,
  paused: false,
  onboardingTrialDaysOverride: null,
  updatedAt: null,
  updatedBy: null,
};

export interface EnforcementSettingsRepository {
  get(): Promise<EnforcementSettings>;
  update(patch: EnforcementSettingsPatch, actorId: string): Promise<EnforcementSettings>;
}

export const ENFORCEMENT_SETTINGS_REPOSITORY = Symbol('ENFORCEMENT_SETTINGS_REPOSITORY');
