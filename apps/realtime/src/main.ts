import { NestFactory } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { JsonLogger } from "@shared/logger";
import { AppModule } from "./app.module";
import { RealtimeGateway } from "./realtime.gateway";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(JsonLogger));

  const config = app.get(AppConfigService);
  const logger = app.get(JsonLogger);

  // This service owns the /realtime namespace at the gateway, matching the
  // socket.io path so Kong routes both the handshake and the health probe.
  app.setGlobalPrefix("realtime");

  // Shutdown hooks are what let a draining pod tell its clients to reconnect
  // instead of having the socket cut from under them.
  app.enableShutdownHooks();

  const gateway = app.get(RealtimeGateway);
  const drainMs = config.realtime.drainSeconds * 1000;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.log(`realtime_draining:open=${gateway.openConnections()}`);
      // Told to reconnect, with jitter applied client-side. A rolling deploy
      // otherwise returns every client at the same instant.
      gateway.server?.emit("reconnect_soon", { inMs: drainMs });
    });
  }

  await app.listen(config.realtime.port);
  logger.log(`realtime_listening:${config.realtime.port}`);
}

void bootstrap();
