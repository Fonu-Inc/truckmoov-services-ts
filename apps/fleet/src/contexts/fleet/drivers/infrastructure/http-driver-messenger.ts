import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";

const REQUEST_TIMEOUT_MS = 8_000;

export class DriverMessageDispatchError extends Error {
  constructor(channel: string, detail: string) {
    super(`Could not send the ${channel} message: ${detail}`);
    this.name = "DriverMessageDispatchError";
  }
}

export type DriverMessageResult = {
  channel: "whatsapp" | "sms";
  recipient: string;
  reference: string | null;
};

@Injectable()
export class HttpDriverMessenger {
  private readonly logger = new Logger(HttpDriverMessenger.name);

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async sendWhatsAppText(
    tenantId: string,
    recipient: string,
    message: string,
  ): Promise<DriverMessageResult> {
    const body = await this.post(tenantId, "/notify/whatsapp/send-message", {
      to: recipient,
      message,
    });
    return { channel: "whatsapp", recipient, reference: referenceFrom(body) };
  }

  /**
   * The opt-in request has to be a template: a business cannot open a WhatsApp
   * conversation with free text, which is the same rule that makes opt-in
   * necessary in the first place.
   */
  async sendWhatsAppOptInTemplate(
    tenantId: string,
    recipient: string,
    variables: Record<string, string>,
  ): Promise<DriverMessageResult> {
    const body = await this.post(tenantId, "/notify/whatsapp/send-other-template", {
      to: recipient,
      template_name: this.config.drivers.whatsappOptInTemplate,
      language: this.config.drivers.whatsappOptInLanguage,
      variables,
    });
    return { channel: "whatsapp", recipient, reference: referenceFrom(body) };
  }

  async sendSms(tenantId: string, recipient: string, message: string): Promise<DriverMessageResult> {
    const body = await this.post(tenantId, "/notify/messages/send", {
      tenantId,
      channel: "sms",
      recipient,
      content: message,
    });
    return { channel: "sms", recipient, reference: referenceFrom(body) };
  }

  private async post(
    tenantId: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const headers = this.caller.headers("notification", { tenantId, legacyRole: "DISPATCHER" });
    if (!headers) {
      throw new DriverMessageDispatchError("message", "messaging is not configured");
    }

    const baseUrl = this.config.overview.notificationServiceUrl.replace(/\/+$/, "");
    try {
      const res = await axios.post<Record<string, unknown>>(`${baseUrl}${path}`, payload, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300) {
        const detail = typeof res.data?.["message"] === "string" ? String(res.data["message"]) : `status ${res.status}`;
        throw new DriverMessageDispatchError("message", detail);
      }
      return res.data ?? {};
    } catch (error) {
      if (error instanceof DriverMessageDispatchError) throw error;
      this.logger.warn(`driver message dispatch failed: ${(error as Error).message}`);
      throw new DriverMessageDispatchError("message", "the notification service is unreachable");
    }
  }

}

function referenceFrom(body: Record<string, unknown>): string | null {
  const data = body["data"];
  if (data && typeof data === "object") {
    const id = (data as Record<string, unknown>)["id"] ?? (data as Record<string, unknown>)["reference"];
    if (typeof id === "string") return id;
  }
  return typeof body["reference"] === "string" ? String(body["reference"]) : null;
}
