import { Module } from '@nestjs/common';
import { ConfigModule } from '@shared/config';
import { LoggerModule } from '@shared/logger';
import { HealthController } from './health.controller';
import { NatsFanoutBridge } from './nats-fanout.bridge';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeTokenService } from './realtime-token.service';

/**
 * A service that holds connections and nothing else.
 *
 * It has no database, no domain logic and no write path. That is the point:
 * long-lived sockets are moved out of apps/auth so a Doppler rotation or a
 * deploy of the auth service does not drop every open connection, and so the
 * blast radius of this service is one feature rather than all of identity.
 */
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [HealthController],
  providers: [RealtimeGateway, RealtimeTokenService, NatsFanoutBridge],
})
export class AppModule {}
