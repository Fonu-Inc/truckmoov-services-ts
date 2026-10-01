/**
 * Waybills and invoices name their vehicle by the registration read off the
 * page, not by id. Plates are compared on letters and digits alone, so
 * "LAG 123 AB" and "lag-123ab" are the same vehicle.
 */
export function registrationKey(registration: string | null | undefined): string {
  return (registration ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * Whether a record on this registration falls inside the allowed set. Null
 * means no limit. A record with no registration is on no one's vehicle, so a
 * limited caller does not see it.
 */
export function isOnAllowedVehicle(
  registration: string | null | undefined,
  allowedRegistrationKeys?: ReadonlySet<string> | null,
): boolean {
  if (!allowedRegistrationKeys) return true;
  const key = registrationKey(registration);
  return key !== "" && allowedRegistrationKeys.has(key);
}
