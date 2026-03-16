import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { EventBusModule } from "@shared/eventbus";
import { GeofenceModule } from "@shared/geofence";
import { LoggerModule } from "@shared/logger";
import { ObjectStorageModule } from "@shared/object-storage";
import { IdempotencyGuard, RolesGuard } from "@shared/rbac";
import {
  BulkImportDriversUseCase,
  CreateDriverUseCase,
  DeleteDriverUseCase,
  DRIVER_REPOSITORY,
  GetDriverUseCase,
  InMemoryDriverRepository,
  ListDriversUseCase,
  MikroDriverRepository,
  SetDriverStatusUseCase,
  UpdateDriverUseCase,
  UpdateDriverContactChannelsUseCase,
} from "./contexts/fleet/drivers";
import {
  EventBusJobStatusEventPublisher,
  InMemoryJobRepository,
  JOB_REPOSITORY,
  JOB_STATUS_EVENT_PUBLISHER,
  ListJobsUseCase,
  MikroJobRepository,
  PublishJobStatusChangedUseCase,
} from "./contexts/fleet/jobs";
import {
  AssignDriverToVehicleUseCase,
  BulkImportVehiclesUseCase,
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
  InMemoryVehicleRepository,
  ListVehiclesUseCase,
  MikroVehicleRepository,
  RegisterVehicleGpsDeviceUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  UpdateVehicleUseCase,
  VEHICLE_REPOSITORY,
} from "./contexts/fleet/vehicles";
import { FleetController } from "./fleet.controller";
import { FLEET_RUNTIME } from "./contexts/fleet/shared/domain/ports/fleet-runtime.port";
import { DefaultFleetRuntime } from "./contexts/fleet/shared/infrastructure/default-fleet-runtime";
import { VehicleHealthService } from "./vehicle-health.service";
import { VehicleLocationListener } from "./vehicle-location.listener";

@Module({
  imports: [ConfigModule, LoggerModule, EventBusModule, ObjectStorageModule, GeofenceModule],
  controllers: [FleetController],
  providers: [
    VehicleHealthService,
    VehicleLocationListener,
    DefaultFleetRuntime,
    {
      provide: FLEET_RUNTIME,
      useExisting: DefaultFleetRuntime,
    },
    InMemoryVehicleRepository,
    MikroVehicleRepository,
    {
      provide: VEHICLE_REPOSITORY,
      inject: [InMemoryVehicleRepository, MikroVehicleRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryVehicleRepository,
        mikroRepository: MikroVehicleRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    CreateVehicleUseCase,
    ListVehiclesUseCase,
    GetVehicleUseCase,
    UpdateVehicleUseCase,
    DeleteVehicleUseCase,
    AssignDriverToVehicleUseCase,
    UnassignDriverFromVehicleUseCase,
    SetVehicleStatusUseCase,
    RegisterVehicleGpsDeviceUseCase,
    BulkImportVehiclesUseCase,
    InMemoryDriverRepository,
    MikroDriverRepository,
    {
      provide: DRIVER_REPOSITORY,
      inject: [InMemoryDriverRepository, MikroDriverRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryDriverRepository,
        mikroRepository: MikroDriverRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    CreateDriverUseCase,
    ListDriversUseCase,
    GetDriverUseCase,
    UpdateDriverUseCase,
    DeleteDriverUseCase,
    SetDriverStatusUseCase,
    UpdateDriverContactChannelsUseCase,
    BulkImportDriversUseCase,
    InMemoryJobRepository,
    MikroJobRepository,
    {
      provide: JOB_REPOSITORY,
      inject: [InMemoryJobRepository, MikroJobRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryJobRepository,
        mikroRepository: MikroJobRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    ListJobsUseCase,
    EventBusJobStatusEventPublisher,
    {
      provide: JOB_STATUS_EVENT_PUBLISHER,
      useExisting: EventBusJobStatusEventPublisher,
    },
    PublishJobStatusChangedUseCase,
    RolesGuard,
    IdempotencyGuard,
  ],
})
export class AppModule {}
