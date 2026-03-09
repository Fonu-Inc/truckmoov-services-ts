import { Injectable } from "@nestjs/common";
import { MailMessage, MailTransport } from "./mailer.port";

@Injectable()
export class NullMailAdapter implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    console.log("[mailer:null]", message);
  }
}
