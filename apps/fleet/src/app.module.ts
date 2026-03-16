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
import { AlertDetectionListener } from "./alert-detection.listener";
import { AlertEscalationService } from "./alert-escalation.service";
import {
  ALERT_REPOSITORY,
  AcknowledgeAlertUseCase,
  GetAlertStatsUseCase,
  InMemoryAlertRepository,
  ListAlertsUseCase,
  ResolveAlertUseCase,
  TriggerAlertUseCase,
} from "./contexts/fleet/alerts";
import { DashboardUseCase, DeliveryMetricsUseCase, ExportUseCase } from "./contexts/fleet/reports";
import {
  ACCESS_LOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
  GetDownloadUrlUseCase,
  InMemoryAccessLogRepository,
  InMemoryDocumentRepository,
  ListAccessLogUseCase,
  ListDocumentsUseCase,
  UploadDocumentUseCase,
} from "./contexts/fleet/documents";
import { ProcessCpaasReplyUseCase } from "./contexts/fleet/integrations/application/process-cpaas-reply.use-case";
import { SyncErpJobUseCase } from "./contexts/fleet/integrations/application/sync-erp-job.use-case";
import { JobSyncListener } from "./job-sync.listener";
import { ScheduledReportService } from "./scheduled-report.service";
import { WebhookController } from "./webhook.controller";
import { IntegrationHealthService } from "./integration-health.service";
import { RateLimitGuard } from "./rate-limit.guard";
import { TenantGuard } from "./tenant.guard";
import { AuditLogService } from "./audit-log.service";
import { AuditEventListener } from "./audit-event.listener";
import { JobAssignmentNotifier } from "./job-assignment-notifier";

@Module({
  imports: [ConfigModule, LoggerModule, EventBusModule, ObjectStorageModule, GeofenceModule],
  controllers: [FleetController, WebhookController],
  providers: [
    VehicleHealthService,
    VehicleLocationListener,
    AlertDetectionListener,
    AlertEscalationService,
    JobSyncListener,
    ScheduledReportService,
    DashboardUseCase,
    DeliveryMetricsUseCase,
    ExportUseCase,
    InMemoryDocumentRepository,
    { provide: DOCUMENT_REPOSITORY, useExisting: InMemoryDocumentRepository },
    InMemoryAccessLogRepository,
    { provide: ACCESS_LOG_REPOSITORY, useExisting: InMemoryAccessLogRepository },
    UploadDocumentUseCase,
    GetDownloadUrlUseCase,
    ListDocumentsUseCase,
    ListAccessLogUseCase,
    ProcessCpaasReplyUseCase,
    SyncErpJobUseCase,
    IntegrationHealthService,
    RateLimitGuard,
    TenantGuard,
    AuditLogService,
    AuditEventListener,
    JobAssignmentNotifier,
    InMemoryAlertRepository,
    {
      provide: ALERT_REPOSITORY,
      useExisting: InMemoryAlertRepository,
    },
    TriggerAlertUseCase,
    AcknowledgeAlertUseCase,
    ResolveAlertUseCase,
    ListAlertsUseCase,
    GetAlertStatsUseCase,
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
