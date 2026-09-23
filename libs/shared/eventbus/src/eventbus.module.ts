import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../../logger/src";
import { EVENT_BUS } from "./event-bus.interface";
import { NatsJetStreamEventBus } from "./nats-jetstream.eventbus";

@Global()
@Module({
  providers: [
    {
      provide: EVENT_BUS,
      inject: [AppLogger, ConfigService],
      useFactory: (logger: AppLogger, configService: ConfigService) => {
        return new NatsJetStreamEventBus(
          logger,
          configService.get<string>("NATS_URL", "nats://localhost:4222"),
          configService.get<string>("NATS_STREAM", "truckmoov_events"),
          {
            user: configService.get<string>("NATS_USER"),
            password: configService.get<string>("NATS_PASSWORD"),
          },
        );
      },
    },
  ],
  exports: [EVENT_BUS],
})
export class EventBusModule {}
