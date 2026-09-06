import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { InMemoryDriverConsentRepository } from "../../../apps/fleet/src/in-memory-driver-consent.repository";
import {
  canSendOn,
  type StoredDriverConsent,
} from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-consent.repository";
import {
  DriverConsentRequiredError,
  DriverMessagingUseCase,
} from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-messaging.use-case";

const DRIVER = {
  id: "d1",
  name: "Chukwuemeka Okafor",
  phone: "+2348012345678",
  contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null },
};

function build(driver: unknown = DRIVER) {
  const consents = new InMemoryDriverConsentRepository();
  const messenger = {
    sendWhatsAppText: vi.fn(async () => ({ channel: "whatsapp" as const, recipient: "x", reference: "wa-1" })),
    sendWhatsAppOptInTemplate: vi.fn(async () => ({
      channel: "whatsapp" as const,
      recipient: "x",
      reference: "wa-optin",
    })),
    sendSms: vi.fn(async () => ({ channel: "sms" as const, recipient: "x", reference: "sms-1" })),
  };
  const drivers = { findById: vi.fn(async () => driver) };
  const useCase = new DriverMessagingUseCase(drivers as never, consents, messenger as never);
  return { useCase, consents, messenger, drivers };
}

async function seed(
  consents: InMemoryDriverConsentRepository,
  overrides: Partial<StoredDriverConsent>,
): Promise<void> {
  const now = new Date();
  await consents.save({
    id: "c1",
    tenantId: "tenant-a",
    driverId: "d1",
    channel: "whatsapp",
    state: "opted_in",
    source: "driver_reply",
    requestedAt: now,
    respondedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("Consent rules", () => {
  // Meta requires prior opt-in; sending without it gets the number reported.
  it("blocks WhatsApp until the driver has opted in", () => {
    expect(canSendOn("whatsapp", "opted_in")).toBe(true);
    expect(canSendOn("whatsapp", "pending")).toBe(false);
    expect(canSendOn("whatsapp", "unknown")).toBe(false);
    expect(canSendOn("whatsapp", "opted_out")).toBe(false);
  });

  // SMS to an operator's own drivers about their own work is permitted until
  // they say stop.
  it("allows SMS until the driver opts out", () => {
    expect(canSendOn("sms", "unknown")).toBe(true);
    expect(canSendOn("sms", "pending")).toBe(true);
    expect(canSendOn("sms", "opted_in")).toBe(true);
    expect(canSendOn("sms", "opted_out")).toBe(false);
  });
});

describe("Sending a driver message", () => {
  it("sends WhatsApp once the driver has opted in", async () => {
    const { useCase, consents, messenger } = build();
    await seed(consents, { state: "opted_in" });

    const result = await useCase.sendMessage("tenant-a", "d1", "whatsapp", "Arrived at Ikeja?");

    expect(messenger.sendWhatsAppText).toHaveBeenCalledOnce();
    expect(result.reference).toBe("wa-1");
  });

  it("refuses WhatsApp with no consent, and does not call the provider", async () => {
    const { useCase, messenger } = build();

    await expect(useCase.sendMessage("tenant-a", "d1", "whatsapp", "Hello")).rejects.toBeInstanceOf(
      DriverConsentRequiredError,
    );
    expect(messenger.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("refuses WhatsApp while consent is only pending", async () => {
    const { useCase, consents, messenger } = build();
    await seed(consents, { state: "pending", respondedAt: null });

    await expect(useCase.sendMessage("tenant-a", "d1", "whatsapp", "Hello")).rejects.toThrow(
      /has not opted in/,
    );
    expect(messenger.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("sends SMS with no consent record at all", async () => {
    const { useCase, messenger } = build();

    const result = await useCase.sendMessage("tenant-a", "d1", "sms", "Traffic on Third Mainland?");
    expect(messenger.sendSms).toHaveBeenCalledOnce();
    expect(result.reference).toBe("sms-1");
  });

  it("refuses SMS after an opt-out", async () => {
    const { useCase, consents, messenger } = build();
    await seed(consents, { channel: "sms", state: "opted_out" });

    await expect(useCase.sendMessage("tenant-a", "d1", "sms", "Hello")).rejects.toThrow(/opted out/);
    expect(messenger.sendSms).not.toHaveBeenCalled();
  });

  it("rejects an empty message before touching the provider", async () => {
    const { useCase, consents, messenger } = build();
    await seed(consents, { state: "opted_in" });

    await expect(useCase.sendMessage("tenant-a", "d1", "whatsapp", "   ")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(messenger.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("refuses when the driver has no number on file", async () => {
    const { useCase } = build({ ...DRIVER, phone: null, contactChannels: {} });

    await expect(useCase.sendMessage("tenant-a", "d1", "sms", "Hello")).rejects.toThrow(
      /no sms number on file/,
    );
  });

  it("404s for a driver in another tenant", async () => {
    const { useCase } = build(null);
    await expect(useCase.sendMessage("tenant-a", "d1", "sms", "Hello")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("Requesting and recording consent", () => {
  it("sends the opt-in template and leaves consent pending, not granted", async () => {
    const { useCase, consents, messenger } = build();

    const result = await useCase.requestConsent("tenant-a", "d1", "whatsapp");

    expect(messenger.sendWhatsAppOptInTemplate).toHaveBeenCalledOnce();
    expect(result.state).toBe("pending");
    expect(result.canSend).toBe(false);

    const stored = await consents.find("tenant-a", "d1", "whatsapp");
    expect(stored?.requestedAt).not.toBeNull();
    expect(stored?.respondedAt).toBeNull();
  });

  it("grants consent only when the reply is recorded", async () => {
    const { useCase } = build();
    await useCase.requestConsent("tenant-a", "d1", "whatsapp");

    const recorded = await useCase.recordResponse("tenant-a", "d1", "whatsapp", "opted_in", "driver_reply");

    expect(recorded.state).toBe("opted_in");
    expect(recorded.canSend).toBe(true);
    expect(recorded.source).toBe("driver_reply");
  });

  it("honours an opt-out recorded after an opt-in", async () => {
    const { useCase } = build();
    await useCase.recordResponse("tenant-a", "d1", "whatsapp", "opted_in", "driver_reply");
    const out = await useCase.recordResponse("tenant-a", "d1", "whatsapp", "opted_out", "driver_reply");

    expect(out.state).toBe("opted_out");
    expect(out.canSend).toBe(false);
  });

  it("reports unknown consent for a driver never asked", async () => {
    const { useCase } = build();
    const consent = await useCase.listConsent("tenant-a", "d1");

    expect(consent.whatsapp).toMatchObject({ state: "unknown", canSend: false });
    expect(consent.sms).toMatchObject({ state: "unknown", canSend: true });
  });
});
