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
    {
      provide: MAIL_TRANSPORT,
      inject: [NullMailAdapter, AppConfigService],
      useFactory: (nullAdapter: NullMailAdapter, config: AppConfigService) =>
        config.mail.transport === "ses" ? new SesMailAdapter(config) : nullAdapter,
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
