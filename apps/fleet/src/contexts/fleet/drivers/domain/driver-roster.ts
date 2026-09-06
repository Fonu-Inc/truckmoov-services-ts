export type DriverRosterRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  licenseNumber: string;
  status: string;
  behaviorScore: number | null;
  trips: number;
  preferredChannel: string;
};

export const DRIVER_SCORE_BANDS = ["excellent", "strong", "fair", "poor", "unscored"] as const;
export type DriverScoreBand = (typeof DRIVER_SCORE_BANDS)[number];

export const DRIVER_TRIP_BANDS = ["0", "1-50", "51-200", "201-500", "500+"] as const;
export type DriverTripBand = (typeof DRIVER_TRIP_BANDS)[number];

export type DriverRosterFilters = {
  query?: string;
  scoreBand?: string;
  tripBand?: string;
  preferredChannel?: string;
};

/**
 * The chip beside a driver's score. Bands are named rather than numeric so the
 * roster, the filter and the detail header can never disagree about where
 * "Strong" ends.
 */
export function scoreBandFor(score: number | null | undefined): DriverScoreBand {
  if (score === null || score === undefined) return "unscored";
  if (score >= 90) return "excellent";
  if (score >= 75) return "strong";
  if (score >= 60) return "fair";
  return "poor";
}

export function tripBandFor(trips: number): DriverTripBand {
  if (trips <= 0) return "0";
  if (trips <= 50) return "1-50";
  if (trips <= 200) return "51-200";
  if (trips <= 500) return "201-500";
  return "500+";
}

/**
 * Search covers name, phone and licence because that is what the box promises,
 * and an operator looking a driver up has one of the three in front of them.
 */
export function applyDriverRosterFilters<T extends DriverRosterRow>(
  drivers: T[],
  filters: DriverRosterFilters,
): T[] {
  const term = filters.query?.trim().toLowerCase();
  const digits = nationalDigits(term ?? "");

  return drivers.filter((driver) => {
    if (filters.scoreBand && scoreBandFor(driver.behaviorScore) !== filters.scoreBand) return false;
    if (filters.tripBand && tripBandFor(driver.trips) !== filters.tripBand) return false;
    if (filters.preferredChannel && driver.preferredChannel !== filters.preferredChannel) return false;
    if (!term) return true;

    const matchesText = [driver.name, driver.licenseNumber, driver.email].some((field) =>
      (field ?? "").toLowerCase().includes(term),
    );
    // Numbers are compared as national significant digits, so 0801 234 5678,
    // 8012345678 and +234 801 234 5678 all find the same driver.
    const matchesPhone =
      digits.length >= 3 && nationalDigits(driver.phone ?? "").includes(digits);

    return matchesText || matchesPhone;
  });
}

export function summarizeDriverStatuses(drivers: Array<{ status: string }>) {
  const counts = { total: 0, active: 0, available: 0, offline: 0, suspended: 0 };
  for (const driver of drivers) {
    counts.total += 1;
    if (driver.status === "active") counts.active += 1;
    else if (driver.status === "available") counts.available += 1;
    else if (driver.status === "offline") counts.offline += 1;
    else if (driver.status === "suspended") counts.suspended += 1;
  }
  return counts;
}

export function buildDriverAllowance(limit: number | null, used: number) {
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    usedPercent: limit === null || limit === 0 ? null : Math.round((used / limit) * 100),
    unlimited: limit === null,
  };
}

/**
 * Strips a number to its national significant digits: punctuation gone, then
 * the +234 country code or the trunk 0, whichever it was written with.
 */
function nationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.replace(/^0+/, "");
  return digits;
}

/**
 * The drivers an owner operator may see: those assigned to one of their own
 * vehicles. An unassigned driver belongs to the tenant at large, not to any one
 * operator, so it is excluded rather than shared.
 */
export function ownedDriverIdsFrom(
  ownedVehicleIds: Iterable<string>,
  drivers: Array<{ id: string; assignedVehicleId: string | null }>,
): Set<string> {
  const vehicles = new Set(ownedVehicleIds);
  return new Set(
    drivers
      .filter((driver) => driver.assignedVehicleId !== null && vehicles.has(driver.assignedVehicleId))
      .map((driver) => driver.id),
  );
}
