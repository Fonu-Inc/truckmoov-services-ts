import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { MAIL_TRANSPORT } from "./mailer.port";
import { MailerService } from "./mailer.service";
import { NullMailAdapter } from "./null-mail.adapter";
import { SesMailAdapter } from "./ses-mail.adapter";
import { SmtpMailAdapter } from "./smtp-mail.adapter";

@Module({
  imports: [ConfigModule],
  providers: [
    NullMailAdapter,
    {
      provide: MAIL_TRANSPORT,
      inject: [NullMailAdapter, AppConfigService],
      useFactory: (nullAdapter: NullMailAdapter, config: AppConfigService) => {
        if (config.mail.transport === "ses") return new SesMailAdapter(config);
        if (config.mail.transport === "smtp") return new SmtpMailAdapter(config);
        return nullAdapter;
      },
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
