import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { AppConfigService } from "@shared/config";
import type { MailMessage, MailTransport } from "./mailer.port";

@Injectable()
export class SmtpMailAdapter implements MailTransport {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    const { host, port, username, password } = config.mail.smtp;
    this.from = config.mail.from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: username, pass: password },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.body,
    });
  }
}
