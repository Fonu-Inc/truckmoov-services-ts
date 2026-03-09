import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AppConfigService } from "@shared/config";
import { createCorsOptions } from "@shared/http";
import { setupSwagger, StandardApiResponse, TransformResponseInterceptor } from "@shared/openapi";
import { AuthResponse, HealthResponse, MeResponse, SessionSchema } from "./dto/auth.schema";

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
