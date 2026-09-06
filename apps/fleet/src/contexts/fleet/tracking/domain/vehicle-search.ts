export type SearchableVehicle = {
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  driverName: string | null;
};

/**
 * The "Search vehicles" box on the map.
 *
 * Matches on plate, make, model and driver name. Deliberately runs over the
 * list the page already holds rather than issuing a second query: the map
 * needs every vehicle regardless, because each one is a pin, so the rows are
 * in hand before the operator types. At thousands of vehicles per tenant that
 * is faster than a round trip. A trigram index behind a query is the move once
 * a tenant's roster outgrows what the map itself loads.
 */
export function matchesVehicleQuery(vehicle: SearchableVehicle, rawQuery: string): boolean {
  const query = normalize(rawQuery);
  if (query === "") return true;

  const haystacks = [vehicle.registrationNumber, vehicle.make, vehicle.model, vehicle.driverName]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map(normalize);

  // Plates are typed with and without their dash, so matching is done on the
  // alphanumerics alone rather than the punctuation an operator happens to use.
  return haystacks.some((value) => value.includes(query));
}

export function applyVehicleSearch<T extends SearchableVehicle>(vehicles: T[], query?: string): T[] {
  if (!query || query.trim() === "") return vehicles;
  return vehicles.filter((vehicle) => matchesVehicleQuery(vehicle, query));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
