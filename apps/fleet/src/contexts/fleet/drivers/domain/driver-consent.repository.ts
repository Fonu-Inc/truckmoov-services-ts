export const CONSENT_CHANNELS = ["whatsapp", "sms"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_STATES = ["unknown", "pending", "opted_in", "opted_out"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export type StoredDriverConsent = {
  id: string;
  tenantId: string;
  driverId: string;
  channel: ConsentChannel;
  state: ConsentState;
  /** Who or what last changed it: "driver_reply", "operator", "import". */
  source: string;
  requestedAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface DriverConsentRepository {
  save(consent: StoredDriverConsent): Promise<void>;
  find(tenantId: string, driverId: string, channel: ConsentChannel): Promise<StoredDriverConsent | null>;
  findAllForDriver(tenantId: string, driverId: string): Promise<StoredDriverConsent[]>;
  findByPhone(tenantId: string, phone: string): Promise<StoredDriverConsent[]>;
}

export const DRIVER_CONSENT_REPOSITORY = Symbol("DRIVER_CONSENT_REPOSITORY");

/**
 * WhatsApp is the strict one: Meta requires prior opt-in, and sending without
 * it gets the number reported and the sender restricted. SMS is permitted
 * unless the driver has explicitly opted out — these are the operator's own
 * drivers being messaged about their own work.
 */
export function canSendOn(channel: ConsentChannel, state: ConsentState): boolean {
  if (channel === "whatsapp") return state === "opted_in";
  return state !== "opted_out";
}

export function consentRefusalReason(channel: ConsentChannel, state: ConsentState): string {
  if (channel === "whatsapp") {
    return state === "opted_out"
      ? "This driver opted out of WhatsApp messages"
      : "This driver has not opted in to WhatsApp yet. Send an opt-in request first.";
  }
  return "This driver opted out of SMS messages";
}
