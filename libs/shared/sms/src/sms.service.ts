import { Inject, Injectable } from "@nestjs/common";
import { SMS_TRANSPORT, SmsTransport } from "./sms.port";

export type SendSmsOptions = {
  to: string;
  template: string;
  variables?: Record<string, string>;
};

@Injectable()
export class SmsService {
  constructor(@Inject(SMS_TRANSPORT) private readonly transport: SmsTransport) {}

  async send(options: SendSmsOptions): Promise<void> {
    const body = interpolate(options.template, options.variables ?? {});
    await this.transport.send({ to: options.to, body });
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
