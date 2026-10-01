export type EnforcementSettings = {
  graceDays: number;
  renewalLeadDays: number;
  autoSuspendEnabled: boolean;
  autoSuspendCapPerRun: number;
  paused: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EnforcementSettingsPatch = Partial<
  Pick<EnforcementSettings, 'graceDays' | 'renewalLeadDays' | 'autoSuspendEnabled' | 'autoSuspendCapPerRun' | 'paused'>
>;

export const ENFORCEMENT_LIMITS = {
  graceDays: { min: 0, max: 30 },
  renewalLeadDays: { min: 1, max: 60 },
  autoSuspendCapPerRun: { min: 1, max: 200 },
} as const;

export const DEFAULT_ENFORCEMENT_SETTINGS: EnforcementSettings = {
  graceDays: 3,
  renewalLeadDays: 7,
  autoSuspendEnabled: false,
  autoSuspendCapPerRun: 10,
  paused: false,
  updatedAt: null,
  updatedBy: null,
};

export interface EnforcementSettingsRepository {
  get(): Promise<EnforcementSettings>;
  update(patch: EnforcementSettingsPatch, actorId: string): Promise<EnforcementSettings>;
}

export const ENFORCEMENT_SETTINGS_REPOSITORY = Symbol('ENFORCEMENT_SETTINGS_REPOSITORY');
