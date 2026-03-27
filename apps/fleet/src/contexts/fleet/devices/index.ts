export { DEVICE_REPOSITORY } from "./domain/repositories/device.repository";
export { DeviceNotFoundError } from "./domain/errors/device-not-found.error";
export {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_STATUSES,
  type DeviceLifecycleStatus,
  type DeviceStatus,
} from "./domain/entities/device.entity";
export { InMemoryDeviceRepository } from "./infrastructure/repositories/in-memory-device.repository";
export { MikroDeviceRepository } from "./infrastructure/repositories/mikro-device.repository";
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
