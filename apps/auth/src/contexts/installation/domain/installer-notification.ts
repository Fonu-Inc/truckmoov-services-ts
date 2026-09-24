import type { InstallationTimeSlot } from './installation-order';
import type { InstallerNotificationPreferences } from './installer';

export const INSTALLER_NOTIFICATION_TYPES = [
  'job_assigned',
  'job_updated',
  'job_reminder',
  'job_cancelled',
  'issue_resolved',
  'device_verified',
  'device_verification_failed',
] as const;
export type InstallerNotificationType = (typeof INSTALLER_NOTIFICATION_TYPES)[number];

export type NotificationToggle = keyof InstallerNotificationPreferences;
export const NOTIFICATION_TOGGLES: readonly NotificationToggle[] = [
  'newJobAssigned',
  'scheduleReminders',
  'jobStatusUpdates',
  'smsAlerts',
  'emailAlerts',
];

export const DEFAULT_NOTIFICATION_PREFERENCES: InstallerNotificationPreferences = {
  newJobAssigned: true,
  scheduleReminders: true,
  jobStatusUpdates: true,
  smsAlerts: true,
  emailAlerts: true,
};

export function preferencesOf(stored: Partial<InstallerNotificationPreferences> | null): InstallerNotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(stored ?? {}) };
}

export function typeToggle(type: InstallerNotificationType): NotificationToggle {
  if (type === 'job_assigned') return 'newJobAssigned';
  if (type === 'job_reminder') return 'scheduleReminders';
  return 'jobStatusUpdates';
}

export type NotifiedDevice = { manufacturer: string; model: string; imei: string };

export type NotificationFacts = {
  jobNumber: string;
  scheduledDate: Date;
  timeSlot: InstallationTimeSlot;
  device?: NotifiedDevice;
  reason?: string;
};

export type NotificationCopy = { title: string; body: string };

const SLOT_NAMES: Record<InstallationTimeSlot, string> = { morning: 'Morning', afternoon: 'Afternoon' };

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function deviceName(device: NotifiedDevice | undefined): string {
  if (!device) return 'A device';
  const name = `${device.manufacturer} ${device.model}`.trim() || 'Device';
  return device.imei ? `${name} (${device.imei})` : name;
}

function sentence(text: string | undefined): string {
  return (text ?? 'unknown reason').trim().replace(/\.+$/, '');
}

const COPY: Record<InstallerNotificationType, (facts: NotificationFacts) => NotificationCopy> = {
  job_assigned: (f) => ({ title: 'New job assigned', body: `You have been assigned a new installation job (${f.jobNumber}).` }),
  job_updated: (f) => ({ title: 'Job updated', body: `Installation details for Job #${f.jobNumber} have been updated.` }),
  job_reminder: (f) => ({
    title: 'Installation reminder',
    body: `Your installation for Job #${f.jobNumber} is tomorrow, ${dayMonth.format(f.scheduledDate)} (${SLOT_NAMES[f.timeSlot]}).`,
  }),
  job_cancelled: (f) => ({ title: 'Job cancelled', body: `Job #${f.jobNumber} has been cancelled.` }),
  issue_resolved: (f) => ({
    title: 'Issue resolved',
    body: `The issue on Job #${f.jobNumber} has been resolved. The job has resumed.`,
  }),
  device_verified: (f) => ({
    title: 'Device verified',
    body: `${deviceName(f.device)} on Job #${f.jobNumber} is now reporting.`,
  }),
  device_verification_failed: (f) => ({
    title: 'Device verification failed',
    body: `${deviceName(f.device)} on Job #${f.jobNumber} failed verification: ${sentence(f.reason)}.`,
  }),
};

export function notificationCopy(type: InstallerNotificationType, facts: NotificationFacts): NotificationCopy {
  return COPY[type](facts);
}

export class InstallerNotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found');
    this.name = 'InstallerNotificationNotFoundError';
  }
}
