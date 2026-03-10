import { Injectable } from "@nestjs/common";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AppConfigService } from "@shared/config";
import type { MailMessage, MailTransport } from "./mailer.port";

@Injectable()
export class SesMailAdapter implements MailTransport {
  private readonly client: SESClient;
  private readonly from: string;

  constructor(config: AppConfigService) {
    this.client = new SESClient({ region: config.mail.region });
    this.from = config.mail.from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: { Html: { Data: message.body, Charset: "UTF-8" } },
        },
      }),
    );
  }
}
