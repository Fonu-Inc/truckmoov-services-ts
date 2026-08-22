import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { JsonLogger } from "@shared/logger";
import { initializeSentry, registerSentryProcessHandlers, SentryExceptionFilter } from "@shared/observability";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { AppModule } from "./app.module";
import { assertTenantScopedControllers } from "./assert-tenant-scoped";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import {
  BulkDeviceImportResponse,
  BulkDeviceImportSchema,
  BulkDriverImportResponse,
  BulkDriverImportSchema,
  BulkVehicleImportResponse,
  BulkVehicleImportSchema,
  DeviceAssignmentValidationResponse,
  DeviceAssignmentValidationSchema,
  DeviceListResponse,
  DeviceResponse,
  DeviceSchema,
  DeviceSetupRequestSchema,
  DeviceSetupRequestResponse,
  DeviceSetupRequestListResponse,
  DispatchSearchResponse,
  DispatchSearchSchema,
  DriverContactChannelsSchema,
  DriverListResponse,
  DriverResponse,
  DriverSchema,
  FleetHealthResponse,
  ConsumptionBucketSchema,
  FuelConsumptionResponse,
  FuelEfficiencyResponse,
  FuelRecordListResponse,
  FuelRecordResponse,
  FuelRecordSchema,
  FuelThresholdListResponse,
  FuelThresholdResponse,
  FuelThresholdSchema,
  ErpWebhookResponse,
  IntegrationHealthResponse,
  IntegrationHealthSchema,
  UploadedMediaResponse,
  UploadedMediaSchema,
  VehicleDriverAssignmentResponse,
  VehicleDriverAssignmentSchema,
  VehicleEfficiencySchema,
  VehicleGpsDeviceSchema,
  VehicleListResponse,
  VehicleResponse,
  VehicleSchema,
  MessageResponse,
  AnalyticsVehiclesSchema,
  AnalyticsDriversSchema,
  AnalyticsJobsSchema,
  AnalyticsSafetySchema,
  AnalyticsSummarySchema,
  AnalyticsSummaryResponse,
  FleetStatusBreakdownSchema,
  FleetStatusSchema,
  FleetStatusResponse,
  JobPipelineSchema,
  JobPipelineResponse,
  FuelLevelVehicleSchema,
  FuelLevelsSchema,
  FuelLevelsResponse,
  DriverScoreSchema,
  DriverScoreListResponse,
  AnalyticsEventSchema,
  AnalyticsEventListResponse,
  VehicleSafetyRadarSchema,
  VehicleSafetyRadarResponse,
  MaintenanceProfileSchema,
  MaintenanceProfileResponse,
  MaintenanceProfileListResponse,
  MaintenanceProfilesSummarySchema,
  MaintenanceProfilesSummaryResponse,
  MaintenanceRecordSchema,
  MaintenanceRecordResponse,
  MaintenanceRecordListResponse,
  MaintenanceRecordsSummarySchema,
  MaintenanceRecordsSummaryResponse,
  ReminderQueuedSchema,
  ReminderQueuedResponse,
  GeofenceZoneSchema,
  GeofenceZoneResponse,
  GeofenceZoneListResponse,
  ComplianceDocumentSchema,
  ComplianceDocumentResponse,
  ComplianceDocumentListResponse,
  ComplianceSummarySchema,
  ComplianceSummaryResponse,
  VehicleProfitabilitySchema,
  VehicleProfitabilityListResponse,
  FinancialSummarySchema,
  FinancialSummaryResponse,
  FinancialConfigSchema,
  FinancialConfigResponse,
  FinancialConfigNullableResponse,
  FinancialConfigListResponse,
  FuelSummarySchema,
  FuelSummaryResponse,
  AuditEntrySchema,
  AuditEntryListResponse,
  ServiceCategoryListResponse,
} from "./dto/fleet.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger("fleet-service"),
  });

  // Fail closed: abort boot if any controller lacks @TenantScoped()/@Public().
  assertTenantScopedControllers(app);

  const cfg = app.get(AppConfigService);
  new JsonLogger("fleet-service").log("jwt_key_id", { keyId: cfg.auth.jwtKeyId });
  const sentryEnabled = initializeSentry(cfg);

  // Kong owns CORS in every deployed environment. Set SERVICE_CORS_ENABLED=true
  // to handle it here instead, which is what a local run without Kong needs.
  if (cfg.server.corsEnabled) {
    app.enableCors(createCorsOptions(cfg.server.corsAllowedOrigins));
  }

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());

  if (sentryEnabled) {
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryExceptionFilter(httpAdapterHost, "fleet"));
    registerSentryProcessHandlers();
  }

  setupSwagger(app, "Fleet Service", "fleet", [
    StandardApiResponse,
    VehicleSchema,
    VehicleGpsDeviceSchema,
    VehicleResponse,
    VehicleListResponse,
    DriverSchema,
    DriverContactChannelsSchema,
    DriverResponse,
    DriverListResponse,
    VehicleDriverAssignmentSchema,
    VehicleDriverAssignmentResponse,
    DeviceSchema,
    DeviceResponse,
    DeviceListResponse,
    DeviceSetupRequestSchema,
    DeviceSetupRequestResponse,
    DeviceSetupRequestListResponse,
    DeviceAssignmentValidationSchema,
    DeviceAssignmentValidationResponse,
    BulkDeviceImportSchema,
    BulkDeviceImportResponse,
    BulkVehicleImportSchema,
    BulkVehicleImportResponse,
    BulkDriverImportSchema,
    BulkDriverImportResponse,
    DispatchSearchSchema,
    DispatchSearchResponse,
    FleetHealthResponse,
    UploadedMediaSchema,
    UploadedMediaResponse,
    FuelRecordSchema,
    FuelRecordResponse,
    FuelRecordListResponse,
    ConsumptionBucketSchema,
    FuelConsumptionResponse,
    VehicleEfficiencySchema,
    FuelEfficiencyResponse,
    FuelThresholdSchema,
    FuelThresholdResponse,
    FuelThresholdListResponse,
    ErpWebhookResponse,
    IntegrationHealthSchema,
    IntegrationHealthResponse,
    MessageResponse,
    AnalyticsVehiclesSchema,
    AnalyticsDriversSchema,
    AnalyticsJobsSchema,
    AnalyticsSafetySchema,
    AnalyticsSummarySchema,
    AnalyticsSummaryResponse,
    FleetStatusBreakdownSchema,
    FleetStatusSchema,
    FleetStatusResponse,
    JobPipelineSchema,
    JobPipelineResponse,
    FuelLevelVehicleSchema,
    FuelLevelsSchema,
    FuelLevelsResponse,
    DriverScoreSchema,
    DriverScoreListResponse,
    AnalyticsEventSchema,
    AnalyticsEventListResponse,
    VehicleSafetyRadarSchema,
    VehicleSafetyRadarResponse,
    MaintenanceProfileSchema,
    MaintenanceProfileResponse,
    MaintenanceProfileListResponse,
    MaintenanceProfilesSummarySchema,
    MaintenanceProfilesSummaryResponse,
    MaintenanceRecordSchema,
    MaintenanceRecordResponse,
    MaintenanceRecordListResponse,
    MaintenanceRecordsSummarySchema,
    MaintenanceRecordsSummaryResponse,
    ReminderQueuedSchema,
    ReminderQueuedResponse,
    GeofenceZoneSchema,
    GeofenceZoneResponse,
    GeofenceZoneListResponse,
    ComplianceDocumentSchema,
    ComplianceDocumentResponse,
    ComplianceDocumentListResponse,
    ComplianceSummarySchema,
    ComplianceSummaryResponse,
    VehicleProfitabilitySchema,
    VehicleProfitabilityListResponse,
    FinancialSummarySchema,
    FinancialSummaryResponse,
    FinancialConfigSchema,
    FinancialConfigResponse,
    FinancialConfigNullableResponse,
    FinancialConfigListResponse,
    FuelSummarySchema,
    FuelSummaryResponse,
    AuditEntrySchema,
    AuditEntryListResponse,
    ServiceCategoryListResponse,
  ]);

  if (cfg.persistence.backend === "mikro-orm") {
    await getFleetOrm(cfg.db);
  }

  await app.listen(cfg.server.fleetPort);
}

void bootstrap();
