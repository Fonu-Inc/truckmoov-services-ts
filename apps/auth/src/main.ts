import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { initializeSentry, registerSentryProcessHandlers, SentryExceptionFilter } from "@shared/observability";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { AuthResponse, HealthResponse, MeResponse, SessionSchema } from "./dto/auth.schema";

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
    HealthResponse,
  ]);

  await app.listen(cfg.server.authPort);
}

void bootstrap();
