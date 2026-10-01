import { VehicleNotFoundError } from "./contexts/fleet/vehicles";
import type { VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import type { AllowedVehicleIds } from "./allowed-vehicles";

/** A vehicle named by its UUID or its plate, as the maintenance screens send either. */
export async function resolveVehicleReference(vehicles: VehicleRepository, value: string, tenantId: string) {
  return (await vehicles.findById(value, tenantId)) ?? vehicles.findByPlateNumber(value, tenantId);
}

/**
 * The UUID of the vehicle a record names. An unknown vehicle, or for a limited
 * caller one that is not theirs, is refused: a record that cannot be joined
 * back to a vehicle is lost to every screen.
 */
export async function knownVehicleId(
  vehicles: VehicleRepository,
  value: string,
  tenantId: string,
  allowed?: AllowedVehicleIds,
): Promise<string> {
  const vehicle = await resolveVehicleReference(vehicles, value, tenantId);
  if (!vehicle || (allowed && !allowed.has(vehicle.id))) throw new VehicleNotFoundError(value);
  return vehicle.id;
}
