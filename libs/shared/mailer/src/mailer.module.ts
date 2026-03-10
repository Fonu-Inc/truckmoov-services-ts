import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { MAIL_TRANSPORT } from "./mailer.port";
import { MailerService } from "./mailer.service";
import { NullMailAdapter } from "./null-mail.adapter";
import { SesMailAdapter } from "./ses-mail.adapter";

@Module({
  imports: [ConfigModule],
  providers: [
    NullMailAdapter,
    SesMailAdapter,
    {
      provide: MAIL_TRANSPORT,
      inject: [NullMailAdapter, SesMailAdapter, AppConfigService],
      useFactory: (
        nullAdapter: NullMailAdapter,
        sesAdapter: SesMailAdapter,
        config: AppConfigService,
      ) => (config.mail.transport === "ses" ? sesAdapter : nullAdapter),
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
