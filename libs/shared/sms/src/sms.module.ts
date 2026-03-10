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
    {
      provide: SMS_TRANSPORT,
      inject: [NullSmsAdapter, AppConfigService],
      useFactory: (nullAdapter: NullSmsAdapter, config: AppConfigService) =>
        config.sms.transport === "dotgo" ? new DotgoSmsAdapter(config) : nullAdapter,
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
