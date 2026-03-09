import { Module } from "@nestjs/common";
import { MAIL_TRANSPORT } from "./mailer.port";
import { MailerService } from "./mailer.service";
import { NullMailAdapter } from "./null-mail.adapter";

@Module({
  providers: [
    NullMailAdapter,
    { provide: MAIL_TRANSPORT, useExisting: NullMailAdapter },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}
