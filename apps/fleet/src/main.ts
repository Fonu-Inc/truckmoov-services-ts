import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createCorsOptions } from "../../../libs/shared/http/src";
import { setupSwagger } from "../../../libs/shared/openapi/src";
import { AppModule } from "./app.module";

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

  setupSwagger(app, "Fleet Service", "fleet");

  const port = Number(process.env.FLEET_PORT ?? 3002);
  await app.listen(port);
}

void bootstrap();
