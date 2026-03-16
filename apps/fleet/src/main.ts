import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { initializeSentry, registerSentryProcessHandlers, SentryExceptionFilter } from "@shared/observability";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { AppModule } from "./app.module";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import {
  BulkDriverImportResponse,
  BulkDriverImportSchema,
  BulkVehicleImportResponse,
  BulkVehicleImportSchema,
  DispatchSearchResponse,
  DispatchSearchSchema,
  DriverContactChannelsSchema,
  DriverListResponse,
  DriverResponse,
  DriverSchema,
  FleetHealthResponse,
  JobListResponse,
  JobSchema,
  JobStatusResponse,
  UploadedMediaResponse,
  UploadedMediaSchema,
  VehicleDriverAssignmentResponse,
  VehicleDriverAssignmentSchema,
  VehicleGpsDeviceSchema,
  VehicleListResponse,
  VehicleResponse,
  VehicleSchema,
} from "./dto/fleet.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const cfg = app.get(AppConfigService);
  const sentryEnabled = initializeSentry(cfg);

  app.enableCors(createCorsOptions(cfg.server.corsAllowedOrigins));

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
    JobSchema,
    JobListResponse,
    VehicleDriverAssignmentSchema,
    VehicleDriverAssignmentResponse,
    BulkVehicleImportSchema,
    BulkVehicleImportResponse,
    BulkDriverImportSchema,
    BulkDriverImportResponse,
    DispatchSearchSchema,
    DispatchSearchResponse,
    JobStatusResponse,
    FleetHealthResponse,
    UploadedMediaSchema,
    UploadedMediaResponse,
  ]);

  if (cfg.persistence.backend === "mikro-orm") {
    await getFleetOrm(cfg.db);
  }

  await app.listen(cfg.server.fleetPort);
}

void bootstrap();
