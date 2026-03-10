import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { SMS_TRANSPORT } from "./sms.port";
import { SmsService } from "./sms.service";
import { NullSmsAdapter } from "./null-sms.adapter";
import { DotgoSmsAdapter } from "./dotgo-sms.adapter";

@Module({
  imports: [ConfigModule],
  providers: [
    NullSmsAdapter,
    DotgoSmsAdapter,
    {
      provide: SMS_TRANSPORT,
      inject: [NullSmsAdapter, DotgoSmsAdapter, AppConfigService],
      useFactory: (
        nullAdapter: NullSmsAdapter,
        dotgoAdapter: DotgoSmsAdapter,
        config: AppConfigService,
      ) => (config.sms.transport === "dotgo" ? dotgoAdapter : nullAdapter),
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
