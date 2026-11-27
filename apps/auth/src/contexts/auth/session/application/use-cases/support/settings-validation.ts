import { InvalidSettingsError } from "../../../domain/errors/invalid-settings.error";

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_FIELDS = [
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "successColor",
  "warningColor",
  "destructiveColor",
  "sidebarBackground",
  "sidebarText",
  "sidebarAccent",
] as const;

export function assertValidTimezone(timezone: string): void {
  // The default for a tenant with no saved settings; supportedValuesOf omits it on some Node versions.
  if (timezone === "UTC") return;

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

/** The DTO checks this too, but a packed string or a half-set theme must never reach storage whatever the caller. */
export function assertValidBrandingColors(branding: Partial<Record<(typeof COLOR_FIELDS)[number], unknown>>): void {
  for (const field of COLOR_FIELDS) {
    const value = branding[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new InvalidSettingsError(`${field} must be an object with dark and light hex colours`);
    }
    for (const mode of ["dark", "light"] as const) {
      const colour = (value as Record<string, unknown>)[mode];
      if (typeof colour !== "string" || !HEX_COLOR_PATTERN.test(colour)) {
        throw new InvalidSettingsError(`${field}.${mode} must be a valid hex colour (e.g. #0052CC)`);
      }
    }
  }
}
