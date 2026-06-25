import type { Device } from "../../domain/entities/device.entity";
import type {
  DeviceIdentityAction,
  DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";

/**
 * Best-effort identity emit: a broker outage must never fail the device
 * lifecycle operation that triggered it.
 */
export async function emitDeviceIdentity(
  publisher: DeviceIdentityEventPublisher,
  device: Device,
  action: DeviceIdentityAction,
): Promise<void> {
  try {
    await publisher.publish({
      tenant_id: device.tenantId,
      device_id: device.id,
      imei: device.imei,
      manufacturer: device.manufacturer,
      model: device.model,
      vehicle_id: device.vehicleId,
      action,
    });
  } catch {
    // swallow — identity propagation is eventually reconciled, not transactional.
  }
}
