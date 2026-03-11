import { InvalidSettingsError } from "../../../domain/errors/invalid-settings.error";

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function assertValidTimezone(timezone: string): void {
  // `Intl.supportedValuesOf` is available in modern Node runtimes.
  // Fallback keeps behavior deterministic when that API is unavailable.
  const supportedValuesOf = (
    Intl as Intl.DateTimeFormatOptions & {
      supportedValuesOf?: (value: string) => string[];
    }
  ).supportedValuesOf;

  if (typeof supportedValuesOf === "function") {
    const supported = supportedValuesOf("timeZone");
    if (!supported.includes(timezone)) {
      throw new InvalidSettingsError(`Invalid timezone: ${timezone}`);
    }
    return;
  }

  try {
    // This throws RangeError for invalid timezone names.
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new InvalidSettingsError(`Invalid timezone: ${timezone}`);
  }
}

export function assertValidShiftRange(start: string, end: string): void {
  if (!HHMM_PATTERN.test(start) || !HHMM_PATTERN.test(end)) {
    throw new InvalidSettingsError("Shift time must be in HH:MM 24-hour format");
  }

  if (start >= end) {
    throw new InvalidSettingsError("shiftStart must be earlier than shiftEnd");
  }
}

export function assertValidWorkDays(workDays: number[]): void {
  if (!workDays.length) {
    throw new InvalidSettingsError("workDays cannot be empty");
  }

  const unique = new Set(workDays);
  if (unique.size !== workDays.length) {
    throw new InvalidSettingsError("workDays must not contain duplicates");
  }

  for (const day of workDays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new InvalidSettingsError("workDays must only contain integers from 1 to 7");
    }
  }
}
