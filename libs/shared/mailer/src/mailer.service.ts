import { Inject, Injectable } from "@nestjs/common";
import { MAIL_TRANSPORT, MailTransport } from "./mailer.port";

export type SendMailOptions = {
  to: string;
  subject: string;
  template: string;
  variables?: Record<string, string>;
};

@Injectable()
export class MailerService {
  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport) {}

  async send(options: SendMailOptions): Promise<void> {
    const body = interpolate(options.template, options.variables ?? {});
    await this.transport.send({ to: options.to, subject: options.subject, body });
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
