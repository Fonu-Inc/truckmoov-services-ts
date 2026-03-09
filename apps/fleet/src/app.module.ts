import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { EventBusModule } from "@shared/eventbus";
import { LoggerModule } from "@shared/logger";
import { IdempotencyGuard, RolesGuard } from "@shared/rbac";
import {
  CreateDriverUseCase,
  DeleteDriverUseCase,
  DRIVER_REPOSITORY,
  GetDriverUseCase,
  InMemoryDriverRepository,
  ListDriversUseCase,
  MikroDriverRepository,
  UpdateDriverUseCase,
} from "./contexts/fleet/drivers";
import {
  EventBusJobStatusEventPublisher,
  JOB_STATUS_EVENT_PUBLISHER,
  PublishJobStatusChangedUseCase,
} from "./contexts/fleet/jobs";
import {
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
  InMemoryVehicleRepository,
  ListVehiclesUseCase,
  MikroVehicleRepository,
  UpdateVehicleUseCase,
  VEHICLE_REPOSITORY,
} from "./contexts/fleet/vehicles";
import { FleetController } from "./fleet.controller";

@Module({
  imports: [ConfigModule, LoggerModule, EventBusModule],
  controllers: [FleetController],
  providers: [
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
