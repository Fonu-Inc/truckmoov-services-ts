import { escapeCsvValue } from '@shared/csv';
import { INSTALLATION_TIME_ZONE } from '@shared/devices';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import type { JobRow } from '@auth/installation/domain/installation-job.reader';

export const HISTORY_EXPORT_CAP = 5000;

export const HISTORY_EXPORT_COLUMNS = [
  'Company Name',
  'Job Number',
  'Site Contact Name',
  'Contact Phone',
  'Installation Location',
  'Devices',
  'Vehicles',
  'Completion Date',
  'Completion Time',
  'Status',
] as const;

const IANA_NAME = /^[A-Za-z]+(?:[/_+-][A-Za-z0-9]+)*$/;

function formatterIn(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
}

/** An IANA zone name the runtime knows; Africa/Lagos when none is given. Offsets like +01:00 are refused. */
export function exportTimeZone(value?: string): string {
  const zone = value?.trim() || INSTALLATION_TIME_ZONE;
  if (!IANA_NAME.test(zone) || !formatterIn(zone)) {
    throw new OnboardingValidationError('timezone', 'timezone must be an IANA time zone, such as Africa/Lagos');
  }
  return zone;
}

function localDateTime(format: Intl.DateTimeFormat, at: Date | null): [string, string] {
  if (!at) return ['', ''];
  const part = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  return [`${part.year}-${part.month}-${part.day}`, `${part.hour}:${part.minute}`];
}

const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');

function historyLine(row: JobRow, format: Intl.DateTimeFormat): string {
  const { order } = row;
  const cells: Array<string | number> = [
    row.customerName,
    order.orderNumber,
    order.siteContactName,
    order.siteContactPhone,
    `${order.city}, ${order.state}`,
    row.deviceCount,
    row.vehicleCount,
    ...localDateTime(format, order.completedAt),
    statusLabel(order.status),
  ];
  return cells.map(escapeCsvValue).join(',');
}

/** The Installation History rows as CSV, completion date and time read in `timeZone`. */
export function historyCsv(rows: JobRow[], timeZone: string): string {
  const format = formatterIn(timeZone)!;
  return [HISTORY_EXPORT_COLUMNS.join(','), ...rows.map((row) => historyLine(row, format))].join('\n');
}
