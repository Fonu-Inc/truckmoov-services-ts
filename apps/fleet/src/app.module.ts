import { Module } from "@nestjs/common";
import { ConfigModule } from "../../../libs/shared/config/src";
import { EventBusModule } from "../../../libs/shared/eventbus/src";
import { LoggerModule } from "../../../libs/shared/logger/src";
import { IdempotencyGuard, RolesGuard } from "../../../libs/shared/rbac/src";
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
      // Use durable adapter by default; switch to in-memory in local test mode.
      provide: VEHICLE_REPOSITORY,
      inject: [InMemoryVehicleRepository, MikroVehicleRepository],
      useFactory: (
        inMemoryRepository: InMemoryVehicleRepository,
        mikroRepository: MikroVehicleRepository,
      ) => {
        return (process.env.PERSISTENCE_BACKEND ?? "mikro-orm") === "in-memory"
          ? inMemoryRepository
          : mikroRepository;
      },
    },
    CreateVehicleUseCase,
    ListVehiclesUseCase,
    GetVehicleUseCase,
    UpdateVehicleUseCase,
    DeleteVehicleUseCase,
    InMemoryDriverRepository,
    MikroDriverRepository,
    {
      // Same backend selection for driver aggregate repository.
      provide: DRIVER_REPOSITORY,
      inject: [InMemoryDriverRepository, MikroDriverRepository],
      useFactory: (
        inMemoryRepository: InMemoryDriverRepository,
        mikroRepository: MikroDriverRepository,
      ) => {
        return (process.env.PERSISTENCE_BACKEND ?? "mikro-orm") === "in-memory"
          ? inMemoryRepository
          : mikroRepository;
      },
    },
    CreateDriverUseCase,
    ListDriversUseCase,
    GetDriverUseCase,
    UpdateDriverUseCase,
    DeleteDriverUseCase,
    EventBusJobStatusEventPublisher,
    {
      // Application use-case depends on publisher port, not raw EventBus.
      provide: JOB_STATUS_EVENT_PUBLISHER,
      useExisting: EventBusJobStatusEventPublisher,
    },
    PublishJobStatusChangedUseCase,
    // Guards are registered as providers so Nest can inject their dependencies.
    RolesGuard,
    IdempotencyGuard,
  ],
})
export class AppModule {}
