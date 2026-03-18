import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { initializeSentry, registerSentryProcessHandlers, SentryExceptionFilter } from "@shared/observability";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { getAuthOrm } from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import {
  AuthResponse,
  DispatcherPreferencesDataSchema,
  DispatcherPreferencesResponse,
  DispatcherPreferencesSchema,
  HealthResponse,
  InviteActionDataSchema,
  InviteActionResponse,
  MeResponse,
  NotificationPreferencesDataSchema,
  NotificationPreferencesResponse,
  NotificationPreferencesSchema,
  OrganizationBrandingSchema,
  OrganizationUserDataSchema,
  OrganizationUserResponse,
  OrganizationUserSchema,
  OrganizationDefaultsSchema,
  OrganizationSettingsResponse,
  OrganizationSettingsSchema,
  OrganizationUsersDataSchema,
  OrganizationUsersResponse,
  ProfileDataSchema,
  ProfileResponse,
  RemoveOrganizationUserDataSchema,
  RemoveOrganizationUserResponse,
  SessionSchema,
  UploadedMediaResponse,
  UploadedMediaSchema,
  UserProfileSchema,
} from "./dto/auth.schema";

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
    app.useGlobalFilters(new SentryExceptionFilter(httpAdapterHost, "auth"));
    registerSentryProcessHandlers();
  }

  setupSwagger(app, "Auth Service", "auth", [
    StandardApiResponse,
    SessionSchema,
    AuthResponse,
    MeResponse,
    UploadedMediaSchema,
    UploadedMediaResponse,
    InviteActionDataSchema,
    InviteActionResponse,
    UserProfileSchema,
    ProfileDataSchema,
    ProfileResponse,
    OrganizationUserSchema,
    OrganizationUsersDataSchema,
    OrganizationUsersResponse,
    OrganizationUserDataSchema,
    OrganizationUserResponse,
    RemoveOrganizationUserDataSchema,
    RemoveOrganizationUserResponse,
    NotificationPreferencesSchema,
    NotificationPreferencesDataSchema,
    NotificationPreferencesResponse,
    DispatcherPreferencesSchema,
    DispatcherPreferencesDataSchema,
    DispatcherPreferencesResponse,
    OrganizationBrandingSchema,
    OrganizationDefaultsSchema,
    OrganizationSettingsSchema,
    OrganizationSettingsResponse,
    HealthResponse,
  ]);

  if (cfg.persistence.backend === "mikro-orm") {
    await getAuthOrm(cfg.db);
  }

  await app.listen(cfg.server.authPort);
}

void bootstrap();
