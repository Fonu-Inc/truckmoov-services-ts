export const SYSTEM_SETTINGS_ID = 'system';
export const SYSTEM_BACKUP_FREQUENCIES = [
  'hourly',
  'daily',
  'weekly',
] as const;

export type SystemBackupFrequency =
  (typeof SYSTEM_BACKUP_FREQUENCIES)[number];

export const DEFAULT_COMPLIANCE_REMINDER_DAYS = 7;
export const MAX_COMPLIANCE_REMINDER_DAYS = 180;

export type SystemSettingsDefaults = {
  timezone: string;
  language: string;
  /**
   * How many days before expiry a compliance document counts as expiring, and
   * a reminder is sent. One platform-wide window: the per-document
   * `reminderDays` column it replaced is retained but no longer consulted.
   */
  complianceReminderDays: number;
};

export type SystemSettingsFeatures = {
  allowNewTenantRegistration: boolean;
  maintenanceMode: boolean;
  enableBetaFeatures: boolean;
};

export type SystemSettingsRetention = {
  gpsDataRetentionDays: number;
  logRetentionDays: number;
  backupFrequency: SystemBackupFrequency;
};

export type SystemSettings = {
  id: typeof SYSTEM_SETTINGS_ID;
  platformName: string;
  supportEmail: string;
  defaults: SystemSettingsDefaults;
  features: SystemSettingsFeatures;
  retention: SystemSettingsRetention;
  updatedByUserId: string | null;
  updatedAt: Date;
};

export function buildDefaultSystemSettings(): SystemSettings {
  return {
    id: SYSTEM_SETTINGS_ID,
    platformName: 'Truckmoov',
    supportEmail: 'support@truckmoov.com',
    defaults: {
      timezone: 'Africa/Lagos',
      language: 'en',
      complianceReminderDays: DEFAULT_COMPLIANCE_REMINDER_DAYS,
    },
    features: {
      allowNewTenantRegistration: true,
      maintenanceMode: false,
      enableBetaFeatures: true,
    },
    retention: {
      gpsDataRetentionDays: 365,
      logRetentionDays: 30,
      backupFrequency: 'daily',
    },
    updatedByUserId: null,
    updatedAt: new Date(0),
  };
}

/**
 * Rows written before `complianceReminderDays` existed hold a `defaults` JSON
 * object without it. Fill it on read so callers never see it missing.
 */
export function normalizeSystemSettings(settings: SystemSettings): SystemSettings {
  if (typeof settings.defaults?.complianceReminderDays === 'number') return settings;
  return {
    ...settings,
    defaults: {
      ...settings.defaults,
      complianceReminderDays: DEFAULT_COMPLIANCE_REMINDER_DAYS,
    },
  };
}

export interface SystemSettingsRepository {
  get(): Promise<SystemSettings | null>;
  save(settings: SystemSettings): Promise<void>;
}

export const SYSTEM_SETTINGS_REPOSITORY = Symbol('SYSTEM_SETTINGS_REPOSITORY');
