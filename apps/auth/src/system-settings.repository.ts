export const SYSTEM_SETTINGS_ID = 'system';
export const SYSTEM_BACKUP_FREQUENCIES = [
  'hourly',
  'daily',
  'weekly',
] as const;

export type SystemBackupFrequency =
  (typeof SYSTEM_BACKUP_FREQUENCIES)[number];

export type SystemSettingsDefaults = {
  timezone: string;
  language: string;
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

export interface SystemSettingsRepository {
  get(): Promise<SystemSettings | null>;
  save(settings: SystemSettings): Promise<void>;
}

export const SYSTEM_SETTINGS_REPOSITORY = Symbol('SYSTEM_SETTINGS_REPOSITORY');
