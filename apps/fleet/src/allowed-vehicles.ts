/**
 * The vehicles a caller is limited to. Null or absent means no limit; an owner
 * operator inside someone else's organisation gets the set of their own.
 */
export type AllowedVehicleIds = ReadonlySet<string> | null | undefined;

export function onlyAllowedVehicles<T extends { vehicleId: string }>(rows: T[], allowed: AllowedVehicleIds): T[] {
  return allowed ? rows.filter((row) => allowed.has(row.vehicleId)) : rows;
}

export function isVehicleAllowed(vehicleId: string, allowed: AllowedVehicleIds): boolean {
  return !allowed || allowed.has(vehicleId);
}
