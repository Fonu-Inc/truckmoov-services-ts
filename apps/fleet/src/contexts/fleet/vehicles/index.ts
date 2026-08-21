export { VEHICLE_REPOSITORY } from "./domain/repositories/vehicle.repository";
export { VehicleNotFoundError } from "./domain/errors/vehicle-not-found.error";
export { InMemoryVehicleRepository } from "./infrastructure/repositories/in-memory-vehicle.repository";
export { MikroVehicleRepository } from "./infrastructure/repositories/mikro-vehicle.repository";
export { CreateVehicleUseCase, VehicleQuotaExceededError } from "./application/use-cases/create-vehicle.use-case";
export { VEHICLE_QUOTA_READER } from "./domain/ports/vehicle-quota-reader.port";
export type { VehicleQuotaReader } from "./domain/ports/vehicle-quota-reader.port";
export {
  MikroVehicleQuotaReader,
  UnlimitedVehicleQuotaReader,
} from "./infrastructure/repositories/mikro-vehicle-quota-reader";
export { ListVehiclesUseCase } from "./application/use-cases/list-vehicles.use-case";
export { GetVehicleUseCase } from "./application/use-cases/get-vehicle.use-case";
export { UpdateVehicleUseCase } from "./application/use-cases/update-vehicle.use-case";
export { DeleteVehicleUseCase } from "./application/use-cases/delete-vehicle.use-case";
export { AssignDriverToVehicleUseCase } from "./application/use-cases/assign-driver-to-vehicle.use-case";
export { UnassignDriverFromVehicleUseCase } from "./application/use-cases/unassign-driver-from-vehicle.use-case";
export { SetVehicleStatusUseCase } from "./application/use-cases/set-vehicle-status.use-case";
export { RegisterVehicleGpsDeviceUseCase } from "./application/use-cases/register-vehicle-gps-device.use-case";
export { ListGpsDevicesUseCase } from "./application/use-cases/list-gps-devices.use-case";
export { BulkImportVehiclesUseCase } from "./application/use-cases/bulk-import-vehicles.use-case";
