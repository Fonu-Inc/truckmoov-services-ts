export const PLATFORM_ALERT_TYPES = [
  'new_tenant_signup',
  'system_errors',
  'billing_alerts',
  'security_alerts',
  'installation_issues',
] as const;

export type PlatformAlertType = (typeof PLATFORM_ALERT_TYPES)[number];

/** `in_app` lands in the admin portal's notification centre and needs no recipient address. */
export const ALERT_CHANNELS = ['email', 'sms', 'slack', 'webhook', 'in_app'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/**
 * Severity applies within an alert type rather than being a type of its own.
 * The security screen filters on it; the other three raise on any severity.
 */
export const ALERT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type PlatformAlertSetting = {
  alertType: PlatformAlertType;
  enabled: boolean;
  channels: AlertChannel[];
  recipients: string[];
  minSeverity: AlertSeverity;
  updatedAt: string;
  updatedBy: string | null;
};

export interface PlatformAlertSettingsRepository {
  findAll(): Promise<PlatformAlertSetting[]>;
  findByType(alertType: PlatformAlertType): Promise<PlatformAlertSetting | null>;
  save(setting: PlatformAlertSetting): Promise<void>;
}

export const PLATFORM_ALERT_SETTINGS_REPOSITORY = Symbol('PLATFORM_ALERT_SETTINGS_REPOSITORY');

export function isPlatformAlertType(value: string): value is PlatformAlertType {
  return PLATFORM_ALERT_TYPES.includes(value as PlatformAlertType);
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Whether an event should raise an alert.
 *
 * A setting with no recipients raises nothing. That is deliberate rather than a
 * silent no-op: an alert with no recipient goes nowhere, so it is reported as
 * unroutable instead of being counted as sent.
 */
export function shouldRaise(
  setting: PlatformAlertSetting,
  severity: AlertSeverity,
): { raise: boolean; reason: 'disabled' | 'below_severity' | 'no_recipients' | null } {
  if (!setting.enabled) return { raise: false, reason: 'disabled' };
  if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[setting.minSeverity]) {
    return { raise: false, reason: 'below_severity' };
  }
  if (setting.recipients.length === 0) return { raise: false, reason: 'no_recipients' };
  return { raise: true, reason: null };
}
