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

/**
 * Ranges the platform offers as a default filter. Stored as a key rather than
 * a pair of dates: "last 7 days" means something different tomorrow, and every
 * chart is meant to move with it.
 */
export const DEFAULT_TIME_RANGES = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'this_year',
] as const;

export type DefaultTimeRange = (typeof DEFAULT_TIME_RANGES)[number];

export function isDefaultTimeRange(value: unknown): value is DefaultTimeRange {
  return typeof value === 'string' && (DEFAULT_TIME_RANGES as readonly string[]).includes(value);
}

export const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd MMM yyyy'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ['12h', '24h'] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const SUPPORT_RESPONSE_HOURS = [4, 24, 48] as const;
export type SupportResponseHours = (typeof SUPPORT_RESPONSE_HOURS)[number];

export type SystemSettingsDefaults = {
  timezone: string;
  language: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  /** The default filter charts, tables and reports open on. Overridable per view. */
  defaultTimeRange: DefaultTimeRange;
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

/**
 * Platform-wide security posture. Enforced, not merely recorded: session
 * timeout is checked on every refresh, audit logging gates whether activity is
 * written, and two-factor is required at login when it is on.
 */
export type SystemSettingsSecurity = {
  requireTwoFactor: boolean;
  /** Idle minutes before a session is refused and destroyed. */
  sessionTimeoutMinutes: number;
  auditLogging: boolean;
};

export const SESSION_TIMEOUT_OPTIONS = [15, 30, 60, 120, 480] as const;

export type SystemSettingsRetention = {
  gpsDataRetentionDays: number;
  logRetentionDays: number;
  backupFrequency: SystemBackupFrequency;
};

export type SystemSettingsProfile = {
  contactPhone: string;
  contactAddress: string;
  /** Link returned by the media upload, null until a logo is set. */
  logoUrl: string | null;
};

export type SystemSettingsSupport = {
  phone: string;
  /** Hours within which support commits to a first response. */
  responseTimeHours: SupportResponseHours;
};

export type SystemSettings = {
  id: typeof SYSTEM_SETTINGS_ID;
  platformName: string;
  supportEmail: string;
  profile: SystemSettingsProfile;
  support: SystemSettingsSupport;
  defaults: SystemSettingsDefaults;
  features: SystemSettingsFeatures;
  retention: SystemSettingsRetention;
  security: SystemSettingsSecurity;
  updatedByUserId: string | null;
  updatedAt: Date;
};

export function buildDefaultSystemSettings(): SystemSettings {
  return {
    id: SYSTEM_SETTINGS_ID,
    platformName: 'Truckmoov',
    supportEmail: 'support@truckmoov.com',
    profile: { contactPhone: '', contactAddress: '', logoUrl: null },
    support: { phone: '', responseTimeHours: 24 },
    defaults: {
      timezone: 'Africa/Lagos',
      language: 'en',
      dateFormat: 'dd/MM/yyyy',
      timeFormat: '24h',
      defaultTimeRange: 'last_7_days',
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
    security: {
      // Off by default so an upgrade does not lock every administrator out
      // before anybody has enrolled.
      requireTwoFactor: false,
      sessionTimeoutMinutes: 30,
      auditLogging: true,
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
  const security = settings.security ?? ({} as SystemSettings['security']);
  const profile = settings.profile ?? ({} as SystemSettings['profile']);
  const support = settings.support ?? ({} as SystemSettings['support']);
  return {
    ...settings,
    profile: {
      contactPhone: stringOr(profile.contactPhone, ''),
      contactAddress: stringOr(profile.contactAddress, ''),
      logoUrl: typeof profile.logoUrl === 'string' && profile.logoUrl ? profile.logoUrl : null,
    },
    support: {
      phone: stringOr(support.phone, ''),
      responseTimeHours: SUPPORT_RESPONSE_HOURS.includes(support.responseTimeHours)
        ? support.responseTimeHours
        : 24,
    },
    security: {
      ...security,
      // A row written before these existed must not read as two-factor
      // enforced, which would lock out an administrator who cannot enrol yet.
      requireTwoFactor: booleanOr(security.requireTwoFactor, false),
      sessionTimeoutMinutes: numberOr(security.sessionTimeoutMinutes, 30),
      auditLogging: booleanOr(security.auditLogging, true),
    },
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
      dateFormat: DATE_FORMATS.includes(defaults.dateFormat) ? defaults.dateFormat : 'dd/MM/yyyy',
      timeFormat: TIME_FORMATS.includes(defaults.timeFormat) ? defaults.timeFormat : '24h',
      complianceReminderDays: numberOr(
        defaults.complianceReminderDays,
        DEFAULT_COMPLIANCE_REMINDER_DAYS,
      ),
      walletTopUpMinKobo: numberOr(defaults.walletTopUpMinKobo, DEFAULT_WALLET_TOP_UP_MIN_KOBO),
      walletTopUpMaxKobo: numberOr(defaults.walletTopUpMaxKobo, DEFAULT_WALLET_TOP_UP_MAX_KOBO),
      platformCurrency: isPlatformCurrency(defaults.platformCurrency)
        ? defaults.platformCurrency
        : DEFAULT_PLATFORM_CURRENCY,
      defaultTimeRange: isDefaultTimeRange(defaults.defaultTimeRange)
        ? defaults.defaultTimeRange
        : 'last_7_days',
    },
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
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
