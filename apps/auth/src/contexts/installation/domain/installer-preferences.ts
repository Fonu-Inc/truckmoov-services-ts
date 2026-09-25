import { INSTALLATION_TIME_ZONE } from '@shared/devices';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import { INSTALLATION_SLOT_HOURS, type InstallationTimeSlot } from './installation-order';

export const DISPLAY_TIME_RANGES = ['today', 'last_7_days', 'last_30_days', 'last_90_days'] as const;
export type DisplayTimeRange = (typeof DISPLAY_TIME_RANGES)[number];

export type InstallerDisplayPreferences = { timezone: string; defaultTimeRange: DisplayTimeRange };

export const DEFAULT_DISPLAY_PREFERENCES: InstallerDisplayPreferences = {
  timezone: INSTALLATION_TIME_ZONE,
  defaultTimeRange: 'last_7_days',
};

export const INSTALLER_SET_AVAILABILITIES = ['available', 'unavailable'] as const;
export type InstallerSetAvailability = (typeof INSTALLER_SET_AVAILABILITIES)[number];

export const PREFERRED_PERIODS = ['weekdays', 'weekends', 'all_days'] as const;
export type PreferredPeriods = (typeof PREFERRED_PERIODS)[number];

/** Lagos wall-clock times, HH:MM (24-hour), start before end. */
export type WorkingHours = { start: string; end: string };

export type InstallerWorkPreferences = {
  availability: InstallerSetAvailability;
  workingHours: WorkingHours;
  preferredPeriods: PreferredPeriods;
};

export const DEFAULT_WORK_PREFERENCES: InstallerWorkPreferences = {
  availability: 'available',
  workingHours: { start: '08:00', end: '18:00' },
  preferredPeriods: 'all_days',
};

export type PreferenceChange<T> = Partial<Record<keyof T, unknown>>;

const IANA_NAME = /^[A-Za-z]+(?:[/_+-][A-Za-z0-9]+)*$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKEND_DAYS = new Set([0, 6]);

/** The runtime's spelling of an IANA zone name, or null for an unknown name or an offset like +01:00. */
export function canonicalTimeZone(value: string): string | null {
  if (!IANA_NAME.test(value)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function timezone(value: unknown): string {
  const zone = typeof value === 'string' ? canonicalTimeZone(value.trim()) : null;
  if (!zone) throw new OnboardingValidationError('timezone', 'timezone must be an IANA time zone, such as Africa/Lagos');
  return zone;
}

function oneOf<T extends string>(field: string, allowed: readonly T[]): (value: unknown) => T {
  return (value) => {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw new OnboardingValidationError(field, `${field} must be one of: ${allowed.join(', ')}`);
    }
    return value as T;
  };
}

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

function clock(field: 'start' | 'end', value: unknown): string {
  if (typeof value !== 'string' || !CLOCK.test(value)) {
    throw new OnboardingValidationError(`workingHours.${field}`, `workingHours.${field} must be a 24-hour time (HH:MM)`);
  }
  return value;
}

function workingHours(value: unknown): WorkingHours {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OnboardingValidationError('workingHours', 'workingHours must be an object with start and end');
  }
  const given = value as Record<string, unknown>;
  const hours = { start: clock('start', given.start), end: clock('end', given.end) };
  if (minutesOf(hours.start) >= minutesOf(hours.end)) {
    throw new OnboardingValidationError('workingHours', 'workingHours.start must be before workingHours.end');
  }
  return hours;
}

type Validators<T> = { [K in keyof T]: (value: unknown) => T[K] };

const DISPLAY_FIELDS: Validators<InstallerDisplayPreferences> = {
  timezone,
  defaultTimeRange: oneOf('defaultTimeRange', DISPLAY_TIME_RANGES),
};

const WORK_FIELDS: Validators<InstallerWorkPreferences> = {
  availability: oneOf('availability', INSTALLER_SET_AVAILABILITIES),
  workingHours,
  preferredPeriods: oneOf('preferredPeriods', PREFERRED_PERIODS),
};

function changed<T extends object>(current: T, change: PreferenceChange<T>, fields: Validators<T>): T {
  const keys = (Object.keys(fields) as Array<keyof T>).filter((key) => change[key] !== undefined);
  if (keys.length === 0) throw new OnboardingValidationError('body', 'Nothing to change');
  return { ...current, ...Object.fromEntries(keys.map((key) => [key, fields[key](change[key])])) };
}

export function displayPreferencesOf(stored: Partial<InstallerDisplayPreferences> | null): InstallerDisplayPreferences {
  return {
    timezone: stored?.timezone ?? DEFAULT_DISPLAY_PREFERENCES.timezone,
    defaultTimeRange: stored?.defaultTimeRange ?? DEFAULT_DISPLAY_PREFERENCES.defaultTimeRange,
  };
}

export function workPreferencesOf(stored: Partial<InstallerWorkPreferences> | null): InstallerWorkPreferences {
  return {
    availability: stored?.availability ?? DEFAULT_WORK_PREFERENCES.availability,
    workingHours: stored?.workingHours ?? DEFAULT_WORK_PREFERENCES.workingHours,
    preferredPeriods: stored?.preferredPeriods ?? DEFAULT_WORK_PREFERENCES.preferredPeriods,
  };
}

/** The stored preferences with only the fields sent changed, each validated. */
export function changedDisplayPreferences(
  stored: Partial<InstallerDisplayPreferences> | null,
  change: PreferenceChange<InstallerDisplayPreferences>,
): InstallerDisplayPreferences {
  return changed(displayPreferencesOf(stored), change, DISPLAY_FIELDS);
}

export function changedWorkPreferences(
  stored: Partial<InstallerWorkPreferences> | null,
  change: PreferenceChange<InstallerWorkPreferences>,
): InstallerWorkPreferences {
  return changed(workPreferencesOf(stored), change, WORK_FIELDS);
}

/** Booked dates are the Lagos day at UTC midnight, so the UTC weekday is the Lagos one. */
function worksOnDay(periods: PreferredPeriods, scheduledDate: Date): boolean {
  if (periods === 'all_days') return true;
  return WEEKEND_DAYS.has(scheduledDate.getUTCDay()) === (periods === 'weekends');
}

function worksDuringSlot(hours: WorkingHours, slot: InstallationTimeSlot): boolean {
  const window = INSTALLATION_SLOT_HOURS[slot];
  return minutesOf(hours.start) < window.end * 60 && window.start * 60 < minutesOf(hours.end);
}

/** Available, working that day, and working hours overlapping the slot's Lagos hours. */
export function takesBooking(
  preferences: InstallerWorkPreferences,
  booking: { scheduledDate: Date; timeSlot: InstallationTimeSlot },
): boolean {
  return (
    preferences.availability === 'available' &&
    worksOnDay(preferences.preferredPeriods, booking.scheduledDate) &&
    worksDuringSlot(preferences.workingHours, booking.timeSlot)
  );
}
