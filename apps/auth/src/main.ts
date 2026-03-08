import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createCorsOptions } from "../../../libs/shared/http/src";
import { setupSwagger } from "../../../libs/shared/openapi/src";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Keep CORS explicit at the edge of the service for browser clients via Kong/web app.
  app.enableCors(createCorsOptions());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupSwagger(app, "Auth Service", "auth");

  const port = Number(process.env.AUTH_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
