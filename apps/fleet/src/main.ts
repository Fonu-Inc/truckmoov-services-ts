import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { initializeSentry, registerSentryProcessHandlers, SentryExceptionFilter } from "@shared/observability";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { AppModule } from "./app.module";
import {
  DriverListResponse,
  DriverResponse,
  DriverSchema,
  FleetHealthResponse,
  JobStatusResponse,
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
    VehicleResponse,
    VehicleListResponse,
    DriverSchema,
    DriverResponse,
    DriverListResponse,
    JobStatusResponse,
    FleetHealthResponse,
  ]);

  await app.listen(cfg.server.fleetPort);
}

void bootstrap();
