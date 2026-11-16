import { Logger, Module } from '@nestjs/common';
import { AccessClient } from '@shared/access';
import { AppConfigService, ConfigModule } from '@shared/config';
import { createServiceCaller } from '@shared/identity';
import { LoggerModule } from '@shared/logger';
import { HealthController } from './health.controller';
import { LiveScopeClient } from './live-scope.client';
import { NatsFanoutBridge } from './nats-fanout.bridge';
import { NatsLink } from './nats-link.service';
import { PlatformMessagingBridge } from './platform-messaging/platform-messaging.bridge';
import { PlatformMessagingCommands } from './platform-messaging/platform-messaging.commands';
import { PlatformMessagingGateway } from './platform-messaging/platform-messaging.gateway';
import { PlatformMessagingService } from './platform-messaging/platform-messaging.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeTokenService } from './realtime-token.service';

/**
 * A service that holds connections and nothing else.
 *
 * It has no database, no domain logic and no write path. That is the point:
 * long-lived sockets are moved out of apps/auth so a Doppler rotation or a
 * deploy of the auth service does not drop every open connection, and so the
 * blast radius of this service is one feature rather than all of identity.
 * The staff inbox socket only relays signed commands and events; the
 * notification service owns every message.
 */
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [HealthController],
  providers: [
    NatsLink,
    {
      provide: AccessClient,
      inject: [AppConfigService, NatsLink],
      useFactory: (config: AppConfigService, link: NatsLink) => {
        const client = new AccessClient(config.auth.serviceUrl, createServiceCaller(config, 'realtime'));
        client
          .listen(link.asBroadcastBus())
          .catch((error: Error) => new Logger('AccessClient').error(`access_listen_failed:${error.message}`));
        return client;
      },
    },
    LiveScopeClient,
    RealtimeGateway,
    RealtimeTokenService,
    NatsFanoutBridge,
    PlatformMessagingCommands,
    PlatformMessagingService,
    PlatformMessagingGateway,
    PlatformMessagingBridge,
  ],
})
export class AppModule {}
