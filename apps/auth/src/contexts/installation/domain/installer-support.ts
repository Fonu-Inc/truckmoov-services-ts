import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import type { SupportTicketChannel } from '../../../support-ticket.repository';

export type InstallerTicketChip = { key: string; label: string };

type CategoryDefinition = {
  label: string;
  description: string;
  channel: SupportTicketChannel;
  /** Only Configuration & Setup is known; the other lists are pending the product team. */
  chips: readonly InstallerTicketChip[];
};

export const INSTALLER_SUPPORT_CATEGORIES = {
  device_hardware: {
    label: 'Device & Hardware',
    description: 'Faulty unit, damaged wiring harness, device will not power up.',
    channel: 'device',
    chips: [],
  },
  configuration_setup: {
    label: 'Configuration & Setup',
    description: 'Device will not accept configuration or stays in the queue.',
    channel: 'device',
    chips: [
      { key: 'commands_rejected', label: 'Configuration commands are rejected by the device' },
      { key: 'stuck_configuration_pending', label: 'Device stuck on Configuration Pending' },
      { key: 'cannot_mark_configured', label: 'Cannot mark the device as configured' },
      { key: 'firmware_out_of_date', label: 'Firmware version is out of date' },
    ],
  },
  sim_connectivity: {
    label: 'SIM & Connectivity',
    description: 'No network, SIM not active, device not reporting after install.',
    channel: 'sim',
    chips: [],
  },
  job_scheduling: {
    label: 'Job & Scheduling',
    description: 'Job details wrong, customer unavailable, need to reschedule.',
    channel: 'other',
    chips: [],
  },
  site_access_safety: {
    label: 'Site Access & Safety',
    description: 'Cannot reach the site, access denied, unsafe working conditions.',
    channel: 'other',
    chips: [],
  },
  account_tools: {
    label: 'My Account & Tools',
    description: 'Portal access, notifications, profile or capability changes.',
    channel: 'other',
    chips: [],
  },
} as const satisfies Record<string, CategoryDefinition>;

export type InstallerSupportCategory = keyof typeof INSTALLER_SUPPORT_CATEGORIES;

export const INSTALLER_FIELD_TIPS = [
  'Check battery voltage (10.5V–14.4V) before wiring — low voltage looks like a faulty device.',
  'Give a newly configured device up to 3 minutes outdoors before declaring no telemetry.',
  'Always photograph the IMEI label and the finished install before leaving the site.',
  'If the SIM shows no network, confirm the vehicle is not parked inside a covered garage.',
] as const;

/** Only Medium's wording is on the screens; the others are plain until the product team words them. */
export const INSTALLER_PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium — slowing me down',
  high: 'High',
  critical: 'Critical',
} as const;

export type InstallerTicketPriority = keyof typeof INSTALLER_PRIORITY_LABELS;

export const INSTALLER_TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_on_tenant: 'Awaiting Response',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const INSTALLATION_JOB_CONTEXT = 'installation_job';
export const MAX_TICKET_DESCRIPTION_LENGTH = 4000;

function oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  const candidate = String(value ?? '').trim();
  if (!(allowed as readonly string[]).includes(candidate)) {
    throw new OnboardingValidationError(field, `${field} must be one of: ${allowed.join(', ')}`);
  }
  return candidate as T;
}

export function installerTicketCategory(value: unknown, field = 'category'): InstallerSupportCategory {
  return oneOf(field, value, Object.keys(INSTALLER_SUPPORT_CATEGORIES) as InstallerSupportCategory[]);
}

export function installerTicketPriority(value: unknown): InstallerTicketPriority {
  return oneOf('priority', value, Object.keys(INSTALLER_PRIORITY_LABELS) as InstallerTicketPriority[]);
}

/** Required from the category's list when it has one; a category without a list takes none. */
export function installerIssueCode(category: InstallerSupportCategory, value: unknown): InstallerTicketChip | null {
  const chips: readonly InstallerTicketChip[] = INSTALLER_SUPPORT_CATEGORIES[category].chips;
  if (chips.length === 0) return null;
  const key = oneOf('issueCode', value, chips.map((chip) => chip.key));
  return chips.find((chip) => chip.key === key)!;
}

export function ticketDescription(value: unknown): string {
  const description = typeof value === 'string' ? value.trim() : '';
  if (!description) throw new OnboardingValidationError('description', 'A description is required');
  if (description.length > MAX_TICKET_DESCRIPTION_LENGTH) {
    throw new OnboardingValidationError('description', `description must be ${MAX_TICKET_DESCRIPTION_LENGTH} characters or fewer`);
  }
  return description;
}

export function installerTicketSubject(category: InstallerSupportCategory, chip: InstallerTicketChip | null): string {
  const label = INSTALLER_SUPPORT_CATEGORIES[category].label;
  return chip ? `${label} — ${chip.label}` : label;
}

export function installerTicketChannel(category: InstallerSupportCategory): SupportTicketChannel {
  return INSTALLER_SUPPORT_CATEGORIES[category].channel;
}

export function installerCategoryLabel(category: string): string {
  return INSTALLER_SUPPORT_CATEGORIES[category as InstallerSupportCategory]?.label ?? category;
}
