import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  canSendOn,
  consentRefusalReason,
  DRIVER_CONSENT_REPOSITORY,
  type ConsentChannel,
  type ConsentState,
  type DriverConsentRepository,
  type StoredDriverConsent,
} from "../../domain/driver-consent.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";
import { HttpDriverMessenger, type DriverMessageResult } from "../../infrastructure/http-driver-messenger";

export class DriverConsentRequiredError extends Error {
  constructor(
    readonly channel: ConsentChannel,
    readonly state: ConsentState,
  ) {
    super(consentRefusalReason(channel, state));
    this.name = "DriverConsentRequiredError";
  }
}

@Injectable()
export class DriverMessagingUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(DRIVER_CONSENT_REPOSITORY) private readonly consents: DriverConsentRepository,
    @Inject(HttpDriverMessenger) private readonly messenger: HttpDriverMessenger,
  ) {}

  async listConsent(tenantId: string, driverId: string) {
    await this.requireDriver(tenantId, driverId);
    const stored = await this.consents.findAllForDriver(tenantId, driverId);

    return {
      whatsapp: present(stored, "whatsapp"),
      sms: present(stored, "sms"),
    };
  }

  /**
   * Sends the opt-in template and marks consent pending. Pending is not
   * consent: the driver's reply is what moves it, recorded by recordResponse.
   */
  async requestConsent(tenantId: string, driverId: string, channel: ConsentChannel) {
    const driver = await this.requireDriver(tenantId, driverId);
    const recipient = this.requireRecipient(driver, channel);
    const now = new Date();

    if (channel === "whatsapp") {
      await this.messenger.sendWhatsAppOptInTemplate(tenantId, recipient, {
        driver_name: driver.name,
      });
    } else {
      await this.messenger.sendSms(
        tenantId,
        recipient,
        `Reply STOP at any time to stop receiving SMS updates from your fleet operator.`,
      );
    }

    const existing = await this.consents.find(tenantId, driverId, channel);
    const consent: StoredDriverConsent = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      driverId,
      channel,
      // An opt-out is not overwritten by asking again: it becomes pending only
      // because the driver was asked afresh, and stays refused until they say
      // otherwise.
      state: "pending",
      source: "operator",
      requestedAt: now,
      respondedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.consents.save(consent);

    return present([consent], channel);
  }

  /** Records what the driver replied, or an operator's manual correction. */
  async recordResponse(
    tenantId: string,
    driverId: string,
    channel: ConsentChannel,
    state: Extract<ConsentState, "opted_in" | "opted_out">,
    source: string,
  ) {
    await this.requireDriver(tenantId, driverId);
    const existing = await this.consents.find(tenantId, driverId, channel);
    const now = new Date();

    const consent: StoredDriverConsent = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      driverId,
      channel,
      state,
      source,
      requestedAt: existing?.requestedAt ?? null,
      respondedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.consents.save(consent);
    return present([consent], channel);
  }

  async sendMessage(
    tenantId: string,
    driverId: string,
    channel: ConsentChannel,
    message: string,
  ): Promise<DriverMessageResult & { consent: ReturnType<typeof present> }> {
    const driver = await this.requireDriver(tenantId, driverId);
    const recipient = this.requireRecipient(driver, channel);

    const body = message?.trim();
    if (!body) throw new BadRequestException("Message cannot be empty");
    if (body.length > 1000) throw new BadRequestException("Message must be 1000 characters or fewer");

    const stored = await this.consents.find(tenantId, driverId, channel);
    const state: ConsentState = stored?.state ?? "unknown";
    if (!canSendOn(channel, state)) {
      throw new DriverConsentRequiredError(channel, state);
    }

    const result =
      channel === "whatsapp"
        ? await this.messenger.sendWhatsAppText(tenantId, recipient, body)
        : await this.messenger.sendSms(tenantId, recipient, body);

    return { ...result, consent: present(stored ? [stored] : [], channel) };
  }

  private async requireDriver(tenantId: string, driverId: string) {
    const driver = await this.drivers.findById(driverId, tenantId);
    if (!driver) throw new NotFoundException("Driver not found");
    return driver;
  }

  private requireRecipient(
    driver: { phone?: string | null; contactChannels?: { whatsappNumber?: string | null; smsNumber?: string | null } },
    channel: ConsentChannel,
  ): string {
    const channelNumber =
      channel === "whatsapp"
        ? driver.contactChannels?.whatsappNumber
        : driver.contactChannels?.smsNumber;
    const recipient = (channelNumber || driver.phone || "").trim();
    if (!recipient) {
      throw new BadRequestException(`This driver has no ${channel} number on file`);
    }
    return recipient;
  }
}

function present(stored: StoredDriverConsent[], channel: ConsentChannel) {
  const consent = stored.find((entry) => entry.channel === channel);
  const state: ConsentState = consent?.state ?? "unknown";
  return {
    channel,
    state,
    canSend: canSendOn(channel, state),
    source: consent?.source ?? null,
    requestedAt: consent?.requestedAt?.toISOString() ?? null,
    respondedAt: consent?.respondedAt?.toISOString() ?? null,
  };
}
