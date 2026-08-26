import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { APP_GUARD, DiscoveryModule } from "@nestjs/core";
import { ConfigModule, AppConfigService } from "@shared/config";
import { EventBusModule } from "@shared/eventbus";
import { MetricsModule } from "@shared/metrics";
import { ReadinessController } from "./readiness.controller";
import { GeofenceModule } from "@shared/geofence";
import { LoggerModule } from "@shared/logger";
import { ObjectStorageModule } from "@shared/object-storage";
import { IdempotencyGuard, RolesGuard, RedisClientProvider } from "@shared/rbac";
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
  AssignDeviceToVehicleUseCase,
  BulkImportDevicesUseCase,
  CreateDeviceUseCase,
  DeleteDeviceUseCase,
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  DEVICE_REPOSITORY,
  EventBusDeviceIdentityEventPublisher,
  GetDeviceUseCase,
  HttpTraccarDeviceProvisioner,
  HttpTraccarTripsProvider,
  InMemoryDeviceRepository,
  ListDevicesUseCase,
  ListVehicleTripsUseCase,
  MikroDeviceRepository,
  NoopTraccarDeviceProvisioner,
  NoopTraccarTripsProvider,
  SetDeviceLifecycleStatusUseCase,
  TRACCAR_DEVICE_PROVISIONER,
  TRACCAR_TRIPS_PROVIDER,
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
  CARRIER_REPOSITORY,
  DATA_BUNDLE_REPOSITORY,
  InMemoryCarrierRepository,
  MikroCarrierRepository,
  InMemoryDataBundleRepository,
  MikroDataBundleRepository,
  ListCarriersUseCase,
  ListDataBundlesUseCase,
} from "./contexts/fleet/carriers";
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
  MikroVehicleQuotaReader,
  UnlimitedVehicleQuotaReader,
  VEHICLE_QUOTA_READER,
  RegisterVehicleGpsDeviceUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  UpdateVehicleUseCase,
  VEHICLE_REPOSITORY,
} from "./contexts/fleet/vehicles";
import { FleetController } from "./fleet.controller";
import { RoutesController } from "./routes.controller";
import { VehiclesController } from "./vehicles.controller";
import { DeviceInstallationController } from "./device-installation.controller";
import { DeviceVerificationSweepService } from "./device-verification-sweep.service";
import { BulkConfigureDevicesUseCase } from "./contexts/fleet/devices/application/use-cases/bulk-configure-devices.use-case";
import { ConfigureDeviceUseCase } from "./contexts/fleet/devices/application/use-cases/configure-device.use-case";
import { ExpireDeviceVerificationsUseCase } from "./contexts/fleet/devices/application/use-cases/expire-device-verifications.use-case";
import { GetDeviceDiagnosticsUseCase } from "./contexts/fleet/devices/application/use-cases/get-device-diagnostics.use-case";
import { GetInstallationQueueUseCase } from "./contexts/fleet/devices/application/use-cases/get-installation-queue.use-case";
import { GetInstallerGuideUseCase } from "./contexts/fleet/devices/application/use-cases/get-installer-guide.use-case";
import { GetVerificationMonitorUseCase } from "./contexts/fleet/devices/application/use-cases/get-verification-monitor.use-case";
import { RecordDeviceTelemetryUseCase } from "./contexts/fleet/devices/application/use-cases/record-device-telemetry.use-case";
import { RecordVerificationFailureUseCase } from "./contexts/fleet/devices/application/use-cases/record-verification-failure.use-case";
import { StartDeviceVerificationUseCase } from "./contexts/fleet/devices/application/use-cases/start-device-verification.use-case";
import { DEVICE_CATALOG_PORT } from "./contexts/fleet/devices/domain/ports/device-catalog.port";
import { DEVICE_VERIFICATION_FAILURE_REPOSITORY } from "./contexts/fleet/devices/domain/repositories/device-verification-failure.repository";
import { HttpDeviceCatalogAdapter } from "./contexts/fleet/devices/infrastructure/http-device-catalog.adapter";
import { InMemoryDeviceVerificationFailureRepository } from "./contexts/fleet/devices/infrastructure/repositories/in-memory-device-verification-failure.repository";
import { MikroDeviceVerificationFailureRepository } from "./contexts/fleet/devices/infrastructure/repositories/mikro-device-verification-failure.repository";
import { WaybillsController } from "./waybills.controller";
import { WaybillExtractionListener } from "./waybill-extraction.listener";
import { WaybillStallSweepService } from "./waybill-stall-sweep.service";
import { ApplyWaybillExtractionUseCase } from "./contexts/fleet/waybills/application/use-cases/apply-waybill-extraction.use-case";
import { ExpireStalledWaybillsUseCase } from "./contexts/fleet/waybills/application/use-cases/expire-stalled-waybills.use-case";
import { ReviewWaybillUseCase } from "./contexts/fleet/waybills/application/use-cases/review-waybill.use-case";
import { WAYBILL_EXTRACTOR } from "./contexts/fleet/waybills/domain/ports/waybill-extractor.port";
import { UnavailableWaybillExtractor } from "./contexts/fleet/waybills/infrastructure/unavailable-waybill-extractor";
import { CaptureWaybillUseCase } from "./contexts/fleet/waybills/application/use-cases/capture-waybill.use-case";
import { ListWaybillsUseCase } from "./contexts/fleet/waybills/application/use-cases/list-waybills.use-case";
import { WAYBILL_REPOSITORY } from "./contexts/fleet/waybills/domain/repositories/waybill.repository";
import { WAYBILL_EXTRACTION_QUEUE } from "./contexts/fleet/waybills/domain/ports/waybill-extraction.port";
import { EventBusWaybillExtractionQueue } from "./contexts/fleet/waybills/infrastructure/eventbus-waybill-extraction.queue";
import { InMemoryWaybillRepository } from "./contexts/fleet/waybills/infrastructure/repositories/in-memory-waybill.repository";
import { MikroWaybillRepository } from "./contexts/fleet/waybills/infrastructure/repositories/mikro-waybill.repository";
import { DevicesController } from "./devices.controller";
import { DeviceSetupRequestsController } from "./device-setup-requests.controller";
import { CarriersController } from "./carriers.controller";
import { DataBundlesController } from "./data-bundles.controller";
import { GpsDevicesController } from "./gps-devices.controller";
import { DriversController } from "./drivers.controller";
import { DispatchController } from "./dispatch.controller";
import { AlertsController } from "./alerts.controller";
import { ReportsController } from "./reports.controller";
import { AnalyticsController } from "./analytics.controller";
import { MaintenanceController } from "./maintenance.controller";
import { GeofencesController } from "./geofences.controller";
import { ComplianceController } from "./compliance.controller";
import { FinancialsController } from "./financials.controller";
import { FuelController } from "./fuel.controller";
import { DocumentsController } from "./documents.controller";
import { AuditController } from "./audit.controller";
import { FLEET_RUNTIME } from "./contexts/fleet/shared/domain/ports/fleet-runtime.port";
import { DefaultFleetRuntime } from "./contexts/fleet/shared/infrastructure/default-fleet-runtime";
import { VehicleHealthService } from "./vehicle-health.service";
import { DeviceTelemetryListener } from "./device-telemetry.listener";
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
import { ComplianceReminderWindowService } from "./compliance-reminder-window.service";
import { ComplianceReminderSweepService } from "./compliance-reminder-sweep.service";
import { MikroComplianceDocumentRepository } from "./mikro-compliance-document.repository";
import { COMPLIANCE_DOCUMENT_REPOSITORY } from "./compliance-document.repository";
import { FleetFinancialsUseCase } from "./fleet-financials.use-case";
import { DISPATCH_JOBS_READER } from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
import { HttpDispatchJobsReader } from "./contexts/fleet/dispatch/infrastructure/http-dispatch-jobs-reader";
import { NoopDispatchJobsReader } from "./contexts/fleet/dispatch/infrastructure/noop-dispatch-jobs-reader";
import { RecommendDriversUseCase } from "./contexts/fleet/dispatch/application/recommend-drivers.use-case";
import {
  DeleteFuelRecordUseCase,
  FUEL_RECORD_REPOSITORY,
  FuelBudgetUseCase,
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
  MikroAccessLogRepository,
  MikroDocumentRepository,
  UploadDocumentUseCase,
  FILE_SCANNER,
  UnscannedFileScanner,
} from "./contexts/fleet/documents";
import { ScheduledReportService } from "./scheduled-report.service";
import { WebhookController } from "./webhook.controller";
import { IntegrationHealthService } from "./integration-health.service";
import { RateLimitGuard } from "./rate-limit.guard";
import { EntitlementReaderService } from "./entitlement-reader.service";
import { QuotaService } from "./quota.service";
import { InternalFleetController } from "./internal-fleet.controller";
import { StorageReconciliationService } from "./storage-reconciliation.service";
import { StorageReporterService } from "./storage-reporter.service";
import { TenantActiveGuard } from "./tenant-active.guard";
import { TenantStatusService } from "./tenant-status.service";
import { TenantGuard } from "./tenant.guard";
import { AuditLogService } from "./audit-log.service";
import { AUDIT_LOG_REPOSITORY } from "./audit-log.repository";
import { InMemoryAuditLogRepository } from "./in-memory-audit-log.repository";
import { MikroAuditLogRepository } from "./mikro-audit-log.repository";
import { AuditEventListener } from "./audit-event.listener";
import { AuthContextMiddleware } from "./auth-context.middleware";

@Module({
  imports: [DiscoveryModule, ConfigModule, LoggerModule, EventBusModule, ObjectStorageModule, GeofenceModule, MetricsModule],
  controllers: [
    InternalFleetController,
    FleetController,
    RoutesController,
    VehiclesController,
    DevicesController,
    DeviceInstallationController,
    WaybillsController,
    DeviceSetupRequestsController,
    CarriersController,
    DataBundlesController,
    GpsDevicesController,
    DriversController,
    DispatchController,
    AlertsController,
    ReportsController,
    AnalyticsController,
    MaintenanceController,
    GeofencesController,
    ComplianceController,
    FinancialsController,
    FuelController,
    DocumentsController,
    AuditController,
    WebhookController,
    ReadinessController,
  ],
  providers: [
    VehicleHealthService,
    VehicleLocationListener,
    DeviceTelemetryListener,
    AlertDetectionListener,
    AlertEscalationService,
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
    ComplianceReminderWindowService,
    ComplianceReminderSweepService,
    ComplianceDocumentsUseCase,
    HttpDispatchJobsReader,
    NoopDispatchJobsReader,
    {
      provide: DISPATCH_JOBS_READER,
      inject: [HttpDispatchJobsReader, NoopDispatchJobsReader, AppConfigService],
      useFactory: (
        httpReader: HttpDispatchJobsReader,
        noopReader: NoopDispatchJobsReader,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? noopReader : httpReader,
    },
    RecommendDriversUseCase,
    FleetFinancialsUseCase,
    DeliveryMetricsUseCase,
    ExportUseCase,
    InMemoryDocumentRepository,
    MikroDocumentRepository,
    {
      provide: DOCUMENT_REPOSITORY,
      inject: [InMemoryDocumentRepository, MikroDocumentRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryDocumentRepository,
        mikro: MikroDocumentRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    InMemoryAccessLogRepository,
    MikroAccessLogRepository,
    {
      provide: ACCESS_LOG_REPOSITORY,
      inject: [InMemoryAccessLogRepository, MikroAccessLogRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAccessLogRepository,
        mikro: MikroAccessLogRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    { provide: FILE_SCANNER, useClass: UnscannedFileScanner },
    UploadDocumentUseCase,
    GetDownloadUrlUseCase,
    ListDocumentsUseCase,
    ListAccessLogUseCase,
    IntegrationHealthService,
    RateLimitGuard,
    // Applied explicitly via @TenantScoped() on FleetController (not a global
    // APP_GUARD). Still a no-op for unauthenticated/health requests.
    TenantGuard,
    TenantStatusService,
    EntitlementReaderService,
    QuotaService,
    StorageReporterService,
    StorageReconciliationService,
    // Global, unlike TenantGuard. A suspended tenant must be refused on every
    // route, so this cannot depend on a new controller remembering a decorator.
    // It is a no-op when the request carries no authenticated tenant, which
    // leaves the readiness probe and the external webhooks untouched.
    { provide: APP_GUARD, useClass: TenantActiveGuard },
    InMemoryAuditLogRepository,
    MikroAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      inject: [InMemoryAuditLogRepository, MikroAuditLogRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryAuditLogRepository,
        mikro: MikroAuditLogRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
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
    MikroVehicleQuotaReader,
    UnlimitedVehicleQuotaReader,
    {
      provide: VEHICLE_QUOTA_READER,
      inject: [UnlimitedVehicleQuotaReader, MikroVehicleQuotaReader, AppConfigService],
      useFactory: (
        unlimited: UnlimitedVehicleQuotaReader,
        mikro: MikroVehicleQuotaReader,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? unlimited : mikro),
    },
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
    InMemoryDeviceVerificationFailureRepository,
    MikroDeviceVerificationFailureRepository,
    {
      provide: DEVICE_VERIFICATION_FAILURE_REPOSITORY,
      inject: [
        InMemoryDeviceVerificationFailureRepository,
        MikroDeviceVerificationFailureRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemoryRepository: InMemoryDeviceVerificationFailureRepository,
        mikroRepository: MikroDeviceVerificationFailureRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    { provide: DEVICE_CATALOG_PORT, useClass: HttpDeviceCatalogAdapter },
    ConfigureDeviceUseCase,
    BulkConfigureDevicesUseCase,
    StartDeviceVerificationUseCase,
    RecordDeviceTelemetryUseCase,
    RecordVerificationFailureUseCase,
    ExpireDeviceVerificationsUseCase,
    GetInstallationQueueUseCase,
    GetVerificationMonitorUseCase,
    GetInstallerGuideUseCase,
    GetDeviceDiagnosticsUseCase,
    DeviceVerificationSweepService,
    InMemoryWaybillRepository,
    MikroWaybillRepository,
    {
      provide: WAYBILL_REPOSITORY,
      inject: [InMemoryWaybillRepository, MikroWaybillRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryWaybillRepository,
        mikroRepository: MikroWaybillRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    { provide: WAYBILL_EXTRACTION_QUEUE, useClass: EventBusWaybillExtractionQueue },
    { provide: WAYBILL_EXTRACTOR, useClass: UnavailableWaybillExtractor },
    CaptureWaybillUseCase,
    ListWaybillsUseCase,
    ApplyWaybillExtractionUseCase,
    ReviewWaybillUseCase,
    ExpireStalledWaybillsUseCase,
    WaybillExtractionListener,
    WaybillStallSweepService,
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
    HttpTraccarTripsProvider,
    NoopTraccarTripsProvider,
    {
      provide: TRACCAR_TRIPS_PROVIDER,
      inject: [HttpTraccarTripsProvider, NoopTraccarTripsProvider, AppConfigService],
      useFactory: (
        httpProvider: HttpTraccarTripsProvider,
        noopProvider: NoopTraccarTripsProvider,
        config: AppConfigService,
      ) => (config.traccar.baseUrl ? httpProvider : noopProvider),
    },
    ListVehicleTripsUseCase,
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
    InMemoryCarrierRepository,
    MikroCarrierRepository,
    {
      provide: CARRIER_REPOSITORY,
      inject: [InMemoryCarrierRepository, MikroCarrierRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryCarrierRepository,
        mikroRepository: MikroCarrierRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    InMemoryDataBundleRepository,
    MikroDataBundleRepository,
    {
      provide: DATA_BUNDLE_REPOSITORY,
      inject: [InMemoryDataBundleRepository, MikroDataBundleRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryDataBundleRepository,
        mikroRepository: MikroDataBundleRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    ListCarriersUseCase,
    ListDataBundlesUseCase,
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
    AuthContextMiddleware,
    RolesGuard,
    IdempotencyGuard,
    RedisClientProvider,
    InMemoryFuelRecordRepository,
    { provide: FUEL_RECORD_REPOSITORY, useExisting: InMemoryFuelRecordRepository },
    FuelThresholdService,
    RecordFuelUseCase,
    ListFuelRecordsUseCase,
    UpdateFuelRecordUseCase,
    DeleteFuelRecordUseCase,
    FuelMetricsUseCase,
    FuelBudgetUseCase,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthContextMiddleware)
      // Matched against the path the controller declares, before the global
      // "fleet" prefix is applied. The liveness probe is unauthenticated.
      .exclude({ path: "health", method: RequestMethod.GET })
      .forRoutes(
        FleetController,
        RoutesController,
        VehiclesController,
        DevicesController,
        DeviceInstallationController,
        WaybillsController,
        DeviceSetupRequestsController,
        CarriersController,
        DataBundlesController,
        GpsDevicesController,
        DriversController,
        DispatchController,
        AlertsController,
        ReportsController,
        AnalyticsController,
        MaintenanceController,
        GeofencesController,
        ComplianceController,
        FinancialsController,
        FuelController,
        DocumentsController,
        AuditController,
      );
  }
}
