import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { APP_GUARD, DiscoveryModule } from "@nestjs/core";
import { ConfigModule, AppConfigService } from "@shared/config";
import { EVENT_BUS, EventBusModule, type EventBus } from "@shared/eventbus";
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
  DEVICE_VERIFICATION_EVENT_PUBLISHER,
  DEVICE_QUOTA_READER,
  DEVICE_REPOSITORY,
  DeviceCatalogLookupUseCase,
  ReinstateDeviceUseCase,
  SuspendDeviceUseCase,
  DeviceFilterOptionsUseCase,
  DeviceInventorySummaryUseCase,
  EventBusDeviceIdentityEventPublisher,
  EventBusDeviceVerificationEventPublisher,
  GetDeviceUseCase,
  HttpTraccarDeviceProvisioner,
  HttpTraccarTripsProvider,
  InMemoryDeviceRepository,
  ListDevicesUseCase,
  ListVehicleTripsUseCase,
  MikroDeviceQuotaReader,
  MikroDeviceRepository,
  NoopTraccarDeviceProvisioner,
  NoopTraccarTripsProvider,
  SetDeviceLifecycleStatusUseCase,
  TRACCAR_DEVICE_PROVISIONER,
  TRACCAR_TRIPS_PROVIDER,
  UnassignDeviceFromVehicleUseCase,
  UnlimitedDeviceQuotaReader,
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
import { InstallerDevicesController } from "./installer-devices.controller";
import { InstallerDevicesUseCases } from "./contexts/fleet/devices/application/use-cases/installer-devices.use-cases";
import { INSTALLER_DEVICE_SCOPE } from "./contexts/fleet/devices/domain/ports/installer-device-scope.port";
import { HttpInstallerDeviceScopeAdapter } from "./contexts/fleet/devices/infrastructure/http-installer-device-scope.adapter";
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
import { InstallationHandoverUseCases } from "./contexts/fleet/devices/application/use-cases/installation-handover.use-cases";
import { DEVICE_CATALOG_PORT } from "./contexts/fleet/devices/domain/ports/device-catalog.port";
import { DEVICE_VERIFICATION_FAILURE_REPOSITORY } from "./contexts/fleet/devices/domain/repositories/device-verification-failure.repository";
import { HttpDeviceCatalogAdapter } from "./contexts/fleet/devices/infrastructure/http-device-catalog.adapter";
import { InMemoryDeviceVerificationFailureRepository } from "./contexts/fleet/devices/infrastructure/repositories/in-memory-device-verification-failure.repository";
import { MikroDeviceVerificationFailureRepository } from "./contexts/fleet/devices/infrastructure/repositories/mikro-device-verification-failure.repository";
import { WaybillsController } from "./waybills.controller";
import { InvoicingController } from "./invoicing.controller";
import { PriceWaybillUseCase } from "./contexts/fleet/waybills/application/use-cases/price-waybill.use-case";
import { GenerateInvoiceUseCase } from "./contexts/fleet/waybills/application/use-cases/generate-invoice.use-case";
import { ListInvoicesUseCase } from "./contexts/fleet/waybills/application/use-cases/list-invoices.use-case";
import {
  ApproveInvoiceUseCase,
  MarkInvoicePaidUseCase,
  SendInvoiceUseCase,
} from "./contexts/fleet/waybills/application/use-cases/invoice-lifecycle.use-cases";
import {
  GetInvoiceSettingsUseCase,
  SaveInvoiceSettingsUseCase,
} from "./contexts/fleet/waybills/application/use-cases/invoice-settings.use-cases";
import {
  DeactivatePricingRuleUseCase,
  ListPricingRulesUseCase,
  SavePricingRuleUseCase,
} from "./contexts/fleet/waybills/application/use-cases/pricing-rule.use-cases";
import { PRICING_RULE_REPOSITORY } from "./contexts/fleet/waybills/domain/repositories/pricing-rule.repository";
import { INVOICE_SETTINGS_REPOSITORY } from "./contexts/fleet/waybills/domain/repositories/invoice-settings.repository";
import { CUSTOMER_INVOICE_REPOSITORY } from "./contexts/fleet/waybills/domain/repositories/customer-invoice.repository";
import { InMemoryPricingRuleRepository } from "./contexts/fleet/waybills/infrastructure/repositories/in-memory-pricing-rule.repository";
import { MikroPricingRuleRepository } from "./contexts/fleet/waybills/infrastructure/repositories/mikro-pricing-rule.repository";
import { InMemoryInvoiceSettingsRepository } from "./contexts/fleet/waybills/infrastructure/repositories/in-memory-invoice-settings.repository";
import { MikroInvoiceSettingsRepository } from "./contexts/fleet/waybills/infrastructure/repositories/mikro-invoice-settings.repository";
import { InMemoryCustomerInvoiceRepository } from "./contexts/fleet/waybills/infrastructure/repositories/in-memory-customer-invoice.repository";
import { MikroCustomerInvoiceRepository } from "./contexts/fleet/waybills/infrastructure/repositories/mikro-customer-invoice.repository";
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
import { MailerModule } from "@shared/mailer";
import { DRIVER_QUOTA_READER } from "./contexts/fleet/drivers/domain/ports/driver-quota-reader.port";
import { DRIVER_CONSENT_REPOSITORY } from "./contexts/fleet/drivers/domain/driver-consent.repository";
import { MikroDriverConsentRepository } from "./mikro-driver-consent.repository";
import { InMemoryDriverConsentRepository } from "./in-memory-driver-consent.repository";
import { DriverMessagingUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-messaging.use-case";
import { HttpDriverMessenger } from "./contexts/fleet/drivers/infrastructure/http-driver-messenger";
import { DriverDetailUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-detail.use-case";
import { DriverBehaviorUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-behavior.use-case";
import { DriverFatigueUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-fatigue.use-case";
import { BEHAVIOR_EVENT_REPOSITORY } from "./contexts/fleet/drivers/domain/driver-behavior";
import { FATIGUE_ANALYSIS_REPOSITORY } from "./contexts/fleet/drivers/domain/driver-fatigue";
import { GEOFENCE_ALERT_READ_REPOSITORY } from "./contexts/fleet/drivers/domain/geofence-alert-read.repository";
import {
  MikroBehaviorEventRepository,
  MikroFatigueAnalysisRepository,
  MikroGeofenceAlertReadRepository,
} from "./mikro-driver-behavior.repository";
import {
  InMemoryBehaviorEventRepository,
  InMemoryFatigueAnalysisRepository,
  InMemoryGeofenceAlertReadRepository,
} from "./in-memory-driver-behavior.repository";
import {
  MikroDriverQuotaReader,
  UnlimitedDriverQuotaReader,
} from "./contexts/fleet/drivers/infrastructure/repositories/mikro-driver-quota-reader";
import { MaintenanceReminderService } from "./maintenance-reminder.service";
import { MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY } from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";
import { MikroMaintenanceReminderScheduleRepository } from "./mikro-maintenance-reminder-schedule.repository";
import { InMemoryMaintenanceReminderScheduleRepository } from "./in-memory-maintenance-reminder-schedule.repository";
import { OverviewController } from "./overview.controller";
import { DriverPerformanceListener } from "./driver-performance.listener";
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
import { LiveTrackingCountsService } from "./live-tracking-counts.service";
import { GeofenceDwellSweepService } from "./geofence-dwell-sweep.service";
import { GeofenceEvaluatorService } from "./contexts/fleet/tracking/application/geofence-evaluator.service";
import { ZONE_OCCUPANCY_REPOSITORY } from "./contexts/fleet/tracking/domain/zone-occupancy.repository";
import { MikroZoneOccupancyRepository } from "./contexts/fleet/tracking/infrastructure/mikro-zone-occupancy.repository";
import { InMemoryZoneOccupancyRepository } from "./contexts/fleet/tracking/infrastructure/in-memory-zone-occupancy.repository";
import { LiveTrackingUseCase } from "./contexts/fleet/tracking/application/live-tracking.use-case";
import { TrackingController } from "./tracking.controller";
import { PublicTrackingController } from "./public-tracking.controller";
import { ShareLinkLifecycleService } from "./share-link-lifecycle.service";
import { SHARE_LINK_REPOSITORY } from "./contexts/fleet/tracking/domain/share-link.repository";
import { MikroShareLinkRepository } from "./contexts/fleet/tracking/infrastructure/mikro-share-link.repository";
import { InMemoryShareLinkRepository } from "./contexts/fleet/tracking/infrastructure/in-memory-share-link.repository";
import {
  ShareVehicleLocationUseCase,
  ViewSharedLocationUseCase,
} from "./contexts/fleet/tracking/application/share-location.use-cases";
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
import { OverviewUseCase } from "./contexts/fleet/reports/application/overview.use-case";
import { VEHICLE_POSITIONS_READER } from "./contexts/fleet/reports/domain/ports/vehicle-positions-reader.port";
import { RECENT_CHATS_READER } from "./contexts/fleet/reports/domain/ports/recent-chats-reader.port";
import { HttpVehiclePositionsReader } from "./contexts/fleet/reports/infrastructure/http-vehicle-positions-reader";
import { HttpRecentChatsReader } from "./contexts/fleet/reports/infrastructure/http-recent-chats-reader";
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
import { AccessClient, accessProviders } from "@shared/access";
import { createServiceCaller } from "@shared/identity";
import { FleetCallerAudience, FleetPermissions, FleetRefusalReporter } from "./access-refusals";

@Module({
  imports: [DiscoveryModule, ConfigModule, LoggerModule, EventBusModule, ObjectStorageModule, GeofenceModule, MetricsModule, MailerModule],
  controllers: [
    InternalFleetController,
    FleetController,
    RoutesController,
    VehiclesController,
    DevicesController,
    DeviceInstallationController,
    InstallerDevicesController,
    WaybillsController,
    InvoicingController,
    DeviceSetupRequestsController,
    CarriersController,
    DataBundlesController,
    GpsDevicesController,
    DriversController,
    DispatchController,
    AlertsController,
    ReportsController,
    OverviewController,
    AnalyticsController,
    MaintenanceController,
    GeofencesController,
    ComplianceController,
    FinancialsController,
    FuelController,
    DocumentsController,
    AuditController,
    WebhookController,
    TrackingController,
    PublicTrackingController,
    ReadinessController,
  ],
  providers: [
    VehicleHealthService,
    VehicleLocationListener,
    LiveTrackingCountsService,
    LiveTrackingUseCase,
    GeofenceEvaluatorService,
    GeofenceDwellSweepService,
    ShareVehicleLocationUseCase,
    ViewSharedLocationUseCase,
    ShareLinkLifecycleService,
    InMemoryShareLinkRepository,
    MikroShareLinkRepository,
    {
      provide: SHARE_LINK_REPOSITORY,
      inject: [InMemoryShareLinkRepository, MikroShareLinkRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryShareLinkRepository,
        mikro: MikroShareLinkRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    InMemoryZoneOccupancyRepository,
    MikroZoneOccupancyRepository,
    {
      provide: ZONE_OCCUPANCY_REPOSITORY,
      inject: [InMemoryZoneOccupancyRepository, MikroZoneOccupancyRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryZoneOccupancyRepository,
        mikro: MikroZoneOccupancyRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    DeviceTelemetryListener,
    AlertDetectionListener,
    AlertEscalationService,
    ScheduledReportService,
    DashboardUseCase,
    OverviewUseCase,
    MikroDriverQuotaReader,
    DriverMessagingUseCase,
    DriverDetailUseCase,
    DriverBehaviorUseCase,
    DriverFatigueUseCase,
    MikroBehaviorEventRepository,
    InMemoryBehaviorEventRepository,
    MikroFatigueAnalysisRepository,
    InMemoryFatigueAnalysisRepository,
    MikroGeofenceAlertReadRepository,
    InMemoryGeofenceAlertReadRepository,
    {
      provide: BEHAVIOR_EVENT_REPOSITORY,
      inject: [InMemoryBehaviorEventRepository, MikroBehaviorEventRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryBehaviorEventRepository,
        mikro: MikroBehaviorEventRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    {
      provide: FATIGUE_ANALYSIS_REPOSITORY,
      inject: [InMemoryFatigueAnalysisRepository, MikroFatigueAnalysisRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryFatigueAnalysisRepository,
        mikro: MikroFatigueAnalysisRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    {
      provide: GEOFENCE_ALERT_READ_REPOSITORY,
      inject: [InMemoryGeofenceAlertReadRepository, MikroGeofenceAlertReadRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryGeofenceAlertReadRepository,
        mikro: MikroGeofenceAlertReadRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    HttpDriverMessenger,
    MikroDriverConsentRepository,
    InMemoryDriverConsentRepository,
    {
      provide: DRIVER_CONSENT_REPOSITORY,
      inject: [InMemoryDriverConsentRepository, MikroDriverConsentRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryDriverConsentRepository,
        mikro: MikroDriverConsentRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    UnlimitedDeviceQuotaReader,
    MikroDeviceQuotaReader,
    {
      provide: DEVICE_QUOTA_READER,
      inject: [UnlimitedDeviceQuotaReader, MikroDeviceQuotaReader, AppConfigService],
      useFactory: (
        unlimited: UnlimitedDeviceQuotaReader,
        mikro: MikroDeviceQuotaReader,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? unlimited : mikro),
    },
    UnlimitedDriverQuotaReader,
    {
      provide: DRIVER_QUOTA_READER,
      inject: [UnlimitedDriverQuotaReader, MikroDriverQuotaReader, AppConfigService],
      useFactory: (
        unlimited: UnlimitedDriverQuotaReader,
        mikro: MikroDriverQuotaReader,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? unlimited : mikro),
    },
    MaintenanceReminderService,
    MikroMaintenanceReminderScheduleRepository,
    InMemoryMaintenanceReminderScheduleRepository,
    {
      provide: MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY,
      inject: [
        InMemoryMaintenanceReminderScheduleRepository,
        MikroMaintenanceReminderScheduleRepository,
        AppConfigService,
      ],
      useFactory: (
        inMemory: InMemoryMaintenanceReminderScheduleRepository,
        mikro: MikroMaintenanceReminderScheduleRepository,
        config: AppConfigService,
      ) => (config.persistence.backend === "in-memory" ? inMemory : mikro),
    },
    DriverPerformanceListener,
    HttpVehiclePositionsReader,
    HttpRecentChatsReader,
    { provide: VEHICLE_POSITIONS_READER, useExisting: HttpVehiclePositionsReader },
    { provide: RECENT_CHATS_READER, useExisting: HttpRecentChatsReader },
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
    ...accessProviders({ callers: FleetCallerAudience, reporter: FleetRefusalReporter, permissions: FleetPermissions }),
    {
      provide: AccessClient,
      inject: [AppConfigService, EVENT_BUS],
      useFactory: (config: AppConfigService, bus: EventBus) => {
        const client = new AccessClient(config.auth.serviceUrl, createServiceCaller(config, "fleet"));
        void client.listen(bus);
        return client;
      },
    },
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
    InstallationHandoverUseCases,
    RecordDeviceTelemetryUseCase,
    RecordVerificationFailureUseCase,
    ExpireDeviceVerificationsUseCase,
    GetInstallationQueueUseCase,
    GetVerificationMonitorUseCase,
    GetInstallerGuideUseCase,
    GetDeviceDiagnosticsUseCase,
    { provide: INSTALLER_DEVICE_SCOPE, useClass: HttpInstallerDeviceScopeAdapter },
    InstallerDevicesUseCases,
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
    InMemoryPricingRuleRepository,
    MikroPricingRuleRepository,
    {
      provide: PRICING_RULE_REPOSITORY,
      inject: [InMemoryPricingRuleRepository, MikroPricingRuleRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryPricingRuleRepository,
        mikroRepository: MikroPricingRuleRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    InMemoryInvoiceSettingsRepository,
    MikroInvoiceSettingsRepository,
    {
      provide: INVOICE_SETTINGS_REPOSITORY,
      inject: [InMemoryInvoiceSettingsRepository, MikroInvoiceSettingsRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryInvoiceSettingsRepository,
        mikroRepository: MikroInvoiceSettingsRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    InMemoryCustomerInvoiceRepository,
    MikroCustomerInvoiceRepository,
    {
      provide: CUSTOMER_INVOICE_REPOSITORY,
      inject: [InMemoryCustomerInvoiceRepository, MikroCustomerInvoiceRepository, AppConfigService],
      useFactory: (
        inMemoryRepository: InMemoryCustomerInvoiceRepository,
        mikroRepository: MikroCustomerInvoiceRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryRepository : mikroRepository,
    },
    PriceWaybillUseCase,
    SavePricingRuleUseCase,
    DeactivatePricingRuleUseCase,
    ListPricingRulesUseCase,
    GetInvoiceSettingsUseCase,
    SaveInvoiceSettingsUseCase,
    GenerateInvoiceUseCase,
    ListInvoicesUseCase,
    ApproveInvoiceUseCase,
    SendInvoiceUseCase,
    MarkInvoicePaidUseCase,
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
    EventBusDeviceVerificationEventPublisher,
    {
      provide: DEVICE_VERIFICATION_EVENT_PUBLISHER,
      useExisting: EventBusDeviceVerificationEventPublisher,
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
    DeviceInventorySummaryUseCase,
    DeviceFilterOptionsUseCase,
    DeviceCatalogLookupUseCase,
    SuspendDeviceUseCase,
    ReinstateDeviceUseCase,
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
        InstallerDevicesController,
        WaybillsController,
        InvoicingController,
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
        TrackingController,
        // Service-to-service routes authenticate the same way. Left out, the
        // roles guard sees no user and refuses every internal call with a 401,
        // which callers were quietly reading as "fleet is unreachable".
        InternalFleetController,
      );
  }
}
