import { NestFactory } from "@nestjs/core";
import { AppConfigService } from "@shared/config";
import { JsonLogger } from "@shared/logger";
import { AppModule } from "./app.module";
import { PlatformMessagingGateway } from "./platform-messaging/platform-messaging.gateway";
import { RealtimeGateway } from "./realtime.gateway";

async function bootstrap(): Promise<void> {
  // Constructed, not resolved from the container: LoggerModule provides
  // AppLogger, and JsonLogger is a plain class the other services instantiate
  // the same way. app.get(JsonLogger) has no provider to find.
  const logger = new JsonLogger("realtime-service");
  const app = await NestFactory.create(AppModule, { logger });

  const config = app.get(AppConfigService);

  // This service owns the /realtime namespace at the gateway, matching the
  // socket.io path so Kong routes both the handshake and the health probe.
  app.setGlobalPrefix("realtime");

  // Shutdown hooks are what let a draining pod tell its clients to reconnect
  // instead of having the socket cut from under them.
  app.enableShutdownHooks();

  const gateway = app.get(RealtimeGateway);
  const staffGateway = app.get(PlatformMessagingGateway);
  const drainMs = config.realtime.drainSeconds * 1000;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.log(`realtime_draining:open=${gateway.openConnections()}`);
      // Told to reconnect, with jitter applied client-side. A rolling deploy
      // otherwise returns every client at the same instant.
      gateway.server?.emit("reconnect_soon", { inMs: drainMs });
      staffGateway.announceDrain(drainMs);
    });
  }

  await app.listen(config.realtime.port);
  logger.log(`realtime_listening:${config.realtime.port}`);
}

// A failed startup must exit so Kubernetes restarts it, instead of hanging without listening.
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
