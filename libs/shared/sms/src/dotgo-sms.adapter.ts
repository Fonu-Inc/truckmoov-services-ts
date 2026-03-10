import { Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { SmsMessage, SmsTransport } from "./sms.port";

@Injectable()
export class DotgoSmsAdapter implements SmsTransport {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly senderId: string;

  constructor(config: AppConfigService) {
    this.apiUrl = config.sms.dotgoApiUrl;
    this.apiKey = config.sms.dotgoApiKey;
    this.senderId = config.sms.dotgoSenderId;
  }

  async send(message: SmsMessage): Promise<void> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        to: message.to,
        body: message.body,
        sender_id: this.senderId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Dotgo SMS failed (${response.status}): ${text}`);
    }
  }
}
