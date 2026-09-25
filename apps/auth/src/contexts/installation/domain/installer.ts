import { workPreferencesOf, type InstallerWorkPreferences } from './installer-preferences';

export const INSTALLER_STATUSES = ['invited', 'active', 'suspended'] as const;
export type InstallerStatus = (typeof INSTALLER_STATUSES)[number];

export const INSTALLER_CAPABILITIES = {
  device_installation: 'Device installation',
  sim_activation: 'SIM activation',
  device_configuration: 'Device configuration',
  diagnostics_troubleshooting: 'Diagnostics & troubleshooting',
  fuel_sensor_calibration: 'Fuel sensor calibration',
} as const;
export type InstallerCapability = keyof typeof INSTALLER_CAPABILITIES;

export type InstallerAvailability =
  | 'not_onboarded'
  | 'unavailable'
  | 'at_capacity'
  | 'available';

export type InstallerNotificationPreferences = {
  newInstallationOffers: boolean;
  scheduleReminders: boolean;
  jobAndIssueUpdates: boolean;
  supportTicketUpdates: boolean;
  emailAlerts: boolean;
  inPlatformAlerts: boolean;
};

export const DEFAULT_MAX_ACTIVE_JOBS = 3;
export const MAX_ACTIVE_JOBS_LIMIT = 20;

export function isInstallerCapability(value: string): value is InstallerCapability {
  return Object.prototype.hasOwnProperty.call(INSTALLER_CAPABILITIES, value);
}

export function formatInstallerCode(sequence: number): string {
  return `INS-${String(sequence).padStart(4, '0')}`;
}

export function installerFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Worked out from the account, the installer's own availability and their workload. */
export function availabilityOf(
  installer: { status: InstallerStatus; maxActiveJobs: number; workPreferences: InstallerWorkPreferences | null },
  activeJobs: number,
): InstallerAvailability {
  if (installer.status === 'invited') return 'not_onboarded';
  if (installer.status === 'suspended') return 'unavailable';
  if (workPreferencesOf(installer.workPreferences).availability === 'unavailable') return 'unavailable';
  return activeJobs >= installer.maxActiveJobs ? 'at_capacity' : 'available';
}

export class InstallerNotFoundError extends Error {
  constructor() {
    super('Installer not found');
    this.name = 'InstallerNotFoundError';
  }
}

/** The action does not apply to the installer as they are now. */
export class InstallerStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallerStateError';
  }
}
