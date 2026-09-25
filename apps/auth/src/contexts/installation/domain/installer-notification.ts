import type { InstallationTimeSlot } from './installation-order';
import type { InstallerNotificationPreferences } from './installer';
import { INSTALLER_TICKET_STATUS_LABELS } from './installer-support';

export const INSTALLER_NOTIFICATION_TYPES = [
  'job_assigned',
  'job_updated',
  'job_reminder',
  'job_cancelled',
  'issue_resolved',
  'device_verified',
  'device_verification_failed',
  'support_ticket_updated',
] as const;
export type InstallerNotificationType = (typeof INSTALLER_NOTIFICATION_TYPES)[number];
export type JobNotificationType = Exclude<InstallerNotificationType, 'support_ticket_updated'>;

export type NotificationToggle = keyof InstallerNotificationPreferences;
type TypeToggle = Exclude<NotificationToggle, 'emailAlerts' | 'inPlatformAlerts'>;

export const NOTIFICATION_TOGGLES: readonly NotificationToggle[] = [
  'newInstallationOffers',
  'scheduleReminders',
  'jobAndIssueUpdates',
  'supportTicketUpdates',
  'emailAlerts',
  'inPlatformAlerts',
];

export const DEFAULT_NOTIFICATION_PREFERENCES: InstallerNotificationPreferences = {
  newInstallationOffers: true,
  scheduleReminders: true,
  jobAndIssueUpdates: true,
  supportTicketUpdates: true,
  emailAlerts: true,
  inPlatformAlerts: true,
};

const TYPE_TOGGLES: Record<InstallerNotificationType, TypeToggle> = {
  job_assigned: 'newInstallationOffers',
  job_reminder: 'scheduleReminders',
  job_updated: 'jobAndIssueUpdates',
  job_cancelled: 'jobAndIssueUpdates',
  issue_resolved: 'jobAndIssueUpdates',
  device_verified: 'jobAndIssueUpdates',
  device_verification_failed: 'jobAndIssueUpdates',
  support_ticket_updated: 'supportTicketUpdates',
};

/** Known toggles only, each defaulting to on. */
export function preferencesOf(stored: Partial<InstallerNotificationPreferences> | null): InstallerNotificationPreferences {
  const entries = NOTIFICATION_TOGGLES.map((toggle) => [toggle, stored?.[toggle] ?? DEFAULT_NOTIFICATION_PREFERENCES[toggle]]);
  return Object.fromEntries(entries) as InstallerNotificationPreferences;
}

export function typeToggle(type: InstallerNotificationType): TypeToggle {
  return TYPE_TOGGLES[type];
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

const COPY: Record<JobNotificationType, (facts: NotificationFacts) => NotificationCopy> = {
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

export function notificationCopy(type: JobNotificationType, facts: NotificationFacts): NotificationCopy {
  return COPY[type](facts);
}

/** What an admin did to an installer's ticket: moved it to a status, or replied with a message. */
export type TicketChange = { status: string } | { messageId: string };

export function ticketChangeKey(ticketId: string, change: TicketChange): string {
  return 'status' in change ? `${ticketId}:status:${change.status}` : `${ticketId}:message:${change.messageId}`;
}

export function ticketUpdateCopy(displayId: string, change: TicketChange): NotificationCopy {
  if ('messageId' in change) {
    return { title: 'New support reply', body: `Support replied to your ticket ${displayId}.` };
  }
  const status = INSTALLER_TICKET_STATUS_LABELS[change.status] ?? change.status;
  return { title: 'Support ticket updated', body: `Your support ticket ${displayId} is now ${status}.` };
}

export class InstallerNotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found');
    this.name = 'InstallerNotificationNotFoundError';
  }
}
