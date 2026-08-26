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

/** Bounds a platform admin can move. Stored in kobo, like every other amount. */
export const DEFAULT_WALLET_TOP_UP_MIN_KOBO = 10_000;
export const DEFAULT_WALLET_TOP_UP_MAX_KOBO = 500_000_000;

export type SystemSettingsDefaults = {
  timezone: string;
  language: string;
  /**
   * How many days before expiry a compliance document counts as expiring, and
   * a reminder is sent. One platform-wide window: the per-document
   * `reminderDays` column it replaced is retained but no longer consulted.
   */
  complianceReminderDays: number;
  /** Smallest top-up a tenant may start, in kobo. */
  walletTopUpMinKobo: number;
  /**
   * Largest top-up a tenant may start, in kobo. A ceiling exists so a mistyped
   * amount is refused rather than accepted and then chased.
   */
  walletTopUpMaxKobo: number;
  /**
   * The currency every financial figure on the platform is expressed in.
   * Changing it does not reinterpret a stored amount: the stored figures stay
   * exactly what they were, which is why only one value is accepted today.
   */
  platformCurrency: PlatformCurrency;
};

export type SystemSettingsFeatures = {
  allowNewTenantRegistration: boolean;
  maintenanceMode: boolean;
  enableBetaFeatures: boolean;
  /**
   * Off means the platform is Naira only: no endpoint returns a converted
   * figure and no rate is applied to a stored amount. Kept as a flag rather
   * than removed code so switching it on is one decision, not a rebuild.
   */
  internationalCurrency: boolean;
};

/**
 * Currencies the platform can be set to. Only Naira is offered, but the setting
 * is stored rather than assumed: a stored amount with no currency beside it is
 * what makes adding a second currency a migration of every financial row.
 */
export const PLATFORM_CURRENCIES = ['NGN'] as const;

export type PlatformCurrency = (typeof PLATFORM_CURRENCIES)[number];

export const DEFAULT_PLATFORM_CURRENCY: PlatformCurrency = 'NGN';

export function isPlatformCurrency(value: unknown): value is PlatformCurrency {
  return (
    typeof value === 'string'
    && PLATFORM_CURRENCIES.includes(value as PlatformCurrency)
  );
}

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
      walletTopUpMinKobo: DEFAULT_WALLET_TOP_UP_MIN_KOBO,
      walletTopUpMaxKobo: DEFAULT_WALLET_TOP_UP_MAX_KOBO,
      platformCurrency: DEFAULT_PLATFORM_CURRENCY,
    },
    features: {
      allowNewTenantRegistration: true,
      maintenanceMode: false,
      enableBetaFeatures: true,
      internationalCurrency: false,
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
  // Each key is filled on its own. A row written before one setting existed can
  // still carry the others, so a single check on one key would leave the rest
  // undefined.
  const defaults = settings.defaults ?? ({} as SystemSettings['defaults']);
  const features = settings.features ?? ({} as SystemSettings['features']);
  return {
    ...settings,
    features: {
      ...features,
      allowNewTenantRegistration: booleanOr(features.allowNewTenantRegistration, true),
      maintenanceMode: booleanOr(features.maintenanceMode, false),
      enableBetaFeatures: booleanOr(features.enableBetaFeatures, true),
      // Absent on every row written before the flag existed. It must read as
      // off there: a missing flag must not switch conversion on.
      internationalCurrency: booleanOr(features.internationalCurrency, false),
    },
    defaults: {
      ...defaults,
      complianceReminderDays: numberOr(
        defaults.complianceReminderDays,
        DEFAULT_COMPLIANCE_REMINDER_DAYS,
      ),
      walletTopUpMinKobo: numberOr(defaults.walletTopUpMinKobo, DEFAULT_WALLET_TOP_UP_MIN_KOBO),
      walletTopUpMaxKobo: numberOr(defaults.walletTopUpMaxKobo, DEFAULT_WALLET_TOP_UP_MAX_KOBO),
      platformCurrency: isPlatformCurrency(defaults.platformCurrency)
        ? defaults.platformCurrency
        : DEFAULT_PLATFORM_CURRENCY,
    },
  };
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface SystemSettingsRepository {
  get(): Promise<SystemSettings | null>;
  save(settings: SystemSettings): Promise<void>;
}

export const SYSTEM_SETTINGS_REPOSITORY = Symbol('SYSTEM_SETTINGS_REPOSITORY');
