import type { INestApplication, Type } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function setupSwagger(
  app: INestApplication,
  serviceName: string,
  tag: string,
  extraModels: Type[] = [],
) {
  const config = new DocumentBuilder()
    .setTitle(serviceName)
    .setDescription(`${serviceName} API docs`)
    .setVersion("0.1.0")
    .addBearerAuth()
    .addExtension("x-service-name", serviceName)
    .addExtension("x-response-envelope", {
      status: "boolean",
      message: "string",
      data: "any",
    })
    .build();

  const document = SwaggerModule.createDocument(app, config, { extraModels });
  // Serve docs under /docs/<service> so Kong can proxy the native Swagger UI path
  // without breaking Nest's relative asset and init-script URLs.
  SwaggerModule.setup(`docs/${tag}`, app, document);
}
