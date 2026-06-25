import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
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
  AssignDeviceToVehicleUseCase,
  BulkImportDevicesUseCase,
  CreateDeviceUseCase,
  DeleteDeviceUseCase,
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  DEVICE_REPOSITORY,
  EventBusDeviceIdentityEventPublisher,
  GetDeviceUseCase,
  HttpTraccarDeviceProvisioner,
  InMemoryDeviceRepository,
  ListDevicesUseCase,
  MikroDeviceRepository,
  NoopTraccarDeviceProvisioner,
  SetDeviceLifecycleStatusUseCase,
  TRACCAR_DEVICE_PROVISIONER,
  UnassignDeviceFromVehicleUseCase,
  UpdateDeviceUseCase,
  ValidateDeviceAssignmentUseCase,
} from "./contexts/fleet/devices";
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  InMemoryDeviceSetupRequestRepository,
  MikroDeviceSetupRequestRepository,
  CreateDeviceSetupRequestUseCase,
  ListDeviceSetupRequestsUseCase,
  GetDeviceSetupRequestUseCase,
  UpdateDeviceSetupRequestStatusUseCase,
} from "./contexts/fleet/device-setup-requests";
import {
  AssignDriverToVehicleUseCase,
  BulkImportVehiclesUseCase,
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
    InMemoryVehicleRepository,
    ListGpsDevicesUseCase,
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
import { FleetAnalyticsUseCase } from "./fleet-analytics.use-case";
import { MaintenanceProfilesUseCase } from "./maintenance-profiles.use-case";
import { MikroMaintenanceProfileRepository } from "./mikro-maintenance-profile.repository";
import { MAINTENANCE_PROFILE_REPOSITORY } from "./maintenance-profile.repository";
import { GeofenceZonesUseCase } from "./geofence-zones.use-case";
import { MikroGeofenceZoneRepository } from "./mikro-geofence-zone.repository";
import { GEOFENCE_ZONE_REPOSITORY } from "./geofence-zone.repository";
import { MaintenanceRecordsUseCase } from "./maintenance-records.use-case";
import { MikroMaintenanceRecordRepository } from "./mikro-maintenance-record.repository";
import { MAINTENANCE_RECORD_REPOSITORY } from "./maintenance-record.repository";
import { ComplianceDocumentsUseCase } from "./compliance-documents.use-case";
import { MikroComplianceDocumentRepository } from "./mikro-compliance-document.repository";
import { COMPLIANCE_DOCUMENT_REPOSITORY } from "./compliance-document.repository";
import { FleetFinancialsUseCase } from "./fleet-financials.use-case";
import {
  DeleteFuelRecordUseCase,
  FUEL_RECORD_REPOSITORY,
  FuelMetricsUseCase,
  FuelThresholdService,
  InMemoryFuelRecordRepository,
  ListFuelRecordsUseCase,
  RecordFuelUseCase,
  UpdateFuelRecordUseCase,
} from "./contexts/fleet/fuel";
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
import { SyncErpJobUseCase } from "./contexts/fleet/integrations/application/sync-erp-job.use-case";
import { JobSyncListener } from "./job-sync.listener";
import { ScheduledReportService } from "./scheduled-report.service";
import { WebhookController } from "./webhook.controller";
import { IntegrationHealthService } from "./integration-health.service";
import { RateLimitGuard } from "./rate-limit.guard";
import { TenantGuard } from "./tenant.guard";
import { AuditLogService } from "./audit-log.service";
import { AuditEventListener } from "./audit-event.listener";
import { AuthContextMiddleware } from "./auth-context.middleware";

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
    FleetAnalyticsUseCase,
    MikroMaintenanceProfileRepository,
    { provide: MAINTENANCE_PROFILE_REPOSITORY, useExisting: MikroMaintenanceProfileRepository },
    MaintenanceProfilesUseCase,
    MikroGeofenceZoneRepository,
    { provide: GEOFENCE_ZONE_REPOSITORY, useExisting: MikroGeofenceZoneRepository },
    GeofenceZonesUseCase,
    MikroMaintenanceRecordRepository,
    { provide: MAINTENANCE_RECORD_REPOSITORY, useExisting: MikroMaintenanceRecordRepository },
    MaintenanceRecordsUseCase,
    MikroComplianceDocumentRepository,
    { provide: COMPLIANCE_DOCUMENT_REPOSITORY, useExisting: MikroComplianceDocumentRepository },
    ComplianceDocumentsUseCase,
    FleetFinancialsUseCase,
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
    SyncErpJobUseCase,
    IntegrationHealthService,
    RateLimitGuard,
    TenantGuard,
    AuditLogService,
    AuditEventListener,
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
    ListGpsDevicesUseCase,
    GetVehicleUseCase,
    UpdateVehicleUseCase,
    DeleteVehicleUseCase,
    AssignDriverToVehicleUseCase,
    UnassignDriverFromVehicleUseCase,
    SetVehicleStatusUseCase,
    RegisterVehicleGpsDeviceUseCase,
    BulkImportVehiclesUseCase,
    InMemoryDeviceRepository,
    MikroDeviceRepository,
    {
      provide: DEVICE_REPOSITORY,
      inject: [InMemoryDeviceRepository, MikroDeviceRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryDeviceRepository,
        mikroRepository: MikroDeviceRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    HttpTraccarDeviceProvisioner,
    NoopTraccarDeviceProvisioner,
    {
      provide: TRACCAR_DEVICE_PROVISIONER,
      inject: [HttpTraccarDeviceProvisioner, NoopTraccarDeviceProvisioner, AppConfigService],
      useFactory: (
        httpProvisioner: HttpTraccarDeviceProvisioner,
        noopProvisioner: NoopTraccarDeviceProvisioner,
        config: AppConfigService,
      ) => (config.traccar.baseUrl ? httpProvisioner : noopProvisioner),
    },
    EventBusDeviceIdentityEventPublisher,
    {
      provide: DEVICE_IDENTITY_EVENT_PUBLISHER,
      useExisting: EventBusDeviceIdentityEventPublisher,
    },
    CreateDeviceUseCase,
    ListDevicesUseCase,
    GetDeviceUseCase,
    UpdateDeviceUseCase,
    DeleteDeviceUseCase,
    BulkImportDevicesUseCase,
    AssignDeviceToVehicleUseCase,
    UnassignDeviceFromVehicleUseCase,
    SetDeviceLifecycleStatusUseCase,
    ValidateDeviceAssignmentUseCase,
    InMemoryDeviceSetupRequestRepository,
    MikroDeviceSetupRequestRepository,
    {
      provide: DEVICE_SETUP_REQUEST_REPOSITORY,
      inject: [InMemoryDeviceSetupRequestRepository, MikroDeviceSetupRequestRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryDeviceSetupRequestRepository,
        mikroRepository: MikroDeviceSetupRequestRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    CreateDeviceSetupRequestUseCase,
    ListDeviceSetupRequestsUseCase,
    GetDeviceSetupRequestUseCase,
    UpdateDeviceSetupRequestStatusUseCase,
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
    AuthContextMiddleware,
    RolesGuard,
    IdempotencyGuard,
    InMemoryFuelRecordRepository,
    { provide: FUEL_RECORD_REPOSITORY, useExisting: InMemoryFuelRecordRepository },
    FuelThresholdService,
    RecordFuelUseCase,
    ListFuelRecordsUseCase,
    UpdateFuelRecordUseCase,
    DeleteFuelRecordUseCase,
    FuelMetricsUseCase,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthContextMiddleware).forRoutes(FleetController);
  }
}
