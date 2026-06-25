export { DEVICE_REPOSITORY } from "./domain/repositories/device.repository";
export { DeviceNotFoundError } from "./domain/errors/device-not-found.error";
export {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_PROVISION_STATUSES,
  DEVICE_STATUSES,
  type DeviceLifecycleStatus,
  type DeviceProvisionStatus,
  type DeviceStatus,
} from "./domain/entities/device.entity";
export {
  TRACCAR_DEVICE_PROVISIONER,
  type TraccarDeviceProvisioner,
} from "./domain/ports/traccar-device.port";
export {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityChangedEvent,
  type DeviceIdentityEventPublisher,
} from "./domain/ports/device-identity-event.publisher";
export { InMemoryDeviceRepository } from "./infrastructure/repositories/in-memory-device.repository";
export { MikroDeviceRepository } from "./infrastructure/repositories/mikro-device.repository";
export { HttpTraccarDeviceProvisioner } from "./infrastructure/traccar/http-traccar-device.provisioner";
export { NoopTraccarDeviceProvisioner } from "./infrastructure/traccar/noop-traccar-device.provisioner";
export { EventBusDeviceIdentityEventPublisher } from "./infrastructure/eventbus-device-identity-event.publisher";
export { CreateDeviceUseCase } from "./application/use-cases/create-device.use-case";
export { ListDevicesUseCase } from "./application/use-cases/list-devices.use-case";
export { GetDeviceUseCase } from "./application/use-cases/get-device.use-case";
export { UpdateDeviceUseCase } from "./application/use-cases/update-device.use-case";
export { DeleteDeviceUseCase } from "./application/use-cases/delete-device.use-case";
export { BulkImportDevicesUseCase } from "./application/use-cases/bulk-import-devices.use-case";
export { AssignDeviceToVehicleUseCase } from "./application/use-cases/assign-device-to-vehicle.use-case";
export { UnassignDeviceFromVehicleUseCase } from "./application/use-cases/unassign-device-from-vehicle.use-case";
export { SetDeviceLifecycleStatusUseCase } from "./application/use-cases/set-device-lifecycle-status.use-case";
export { ValidateDeviceAssignmentUseCase } from "./application/use-cases/validate-device-assignment.use-case";
