import { Injectable } from "@nestjs/common";
import axios from "axios";
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
    const response = await axios.post(
      this.apiUrl,
      {
        to: message.to,
        body: message.body,
        sender_id: this.senderId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      const text =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      throw new Error(`Dotgo SMS failed (${response.status}): ${text}`);
    }
  }
}
