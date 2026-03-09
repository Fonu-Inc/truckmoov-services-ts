import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
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

  app.enableCors(createCorsOptions(cfg.server.corsAllowedOrigins));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());

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
