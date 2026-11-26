import type { StoredDeviceAssignment } from './installation-order.repository';

/** Fits free devices to the unbound units in unit order; whichever side is longer keeps its extras. */
export function pairUnitsWithDevices(
  units: StoredDeviceAssignment[],
  freeDeviceIds: string[],
): StoredDeviceAssignment[] {
  const free = [...new Set(freeDeviceIds)];
  return units
    .filter((unit) => !unit.fleetDeviceId)
    .sort((a, b) => a.deviceIndex - b.deviceIndex)
    .slice(0, free.length)
    .map((unit, i) => ({ ...unit, fleetDeviceId: free[i] }));
}
