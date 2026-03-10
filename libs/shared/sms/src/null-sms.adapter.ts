import { Injectable } from "@nestjs/common";
import type { SmsMessage, SmsTransport } from "./sms.port";

@Injectable()
export class NullSmsAdapter implements SmsTransport {
  async send(message: SmsMessage): Promise<void> {
    console.log("[sms:null]", message);
  }
}
