/**
 * What the platform needs from a payment provider, expressed without naming one.
 *
 * Call sites depend on this and never on Paystack. Adding a second provider, or
 * switching at runtime, is then a matter of binding a different adapter rather
 * than editing the use cases that take money.
 */
export type ChargeRequest = {
  /** Ours, and unique. The provider echoes it back on the webhook. */
  reference: string;
  amountKobo: number;
  customerEmail: string;
  /** Where the customer returns after paying, when the provider supports it. */
  redirectUrl?: string;
  /** Echoed back by the provider so the callback can be routed without a lookup. */
  metadata?: Record<string, unknown>;
};

export type ChargeInitiated = {
  reference: string;
  /** Null when the provider is unconfigured, which is not an error. */
  authorizationUrl: string | null;
  provider: string;
};

export type RefundStatus = 'pending' | 'processed' | 'failed';

export type RefundResult = {
  status: RefundStatus;
  /** The provider's id for the refund; null when it does not give one. */
  providerRefundId: string | null;
};

/** The provider's own record of a charge, asked for by reference. */
export type ChargeVerification = PaidAmount & { paid: boolean };

export type RefundLookup = {
  status: RefundStatus | 'unknown';
  providerRefundId: string | null;
};

/** A provider's report on a refund it was asked to make earlier. */
export type RefundCallback = RefundResult;

export class PaymentGatewayError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
  }
}

/** A provider callback, reduced to what the platform acts on. */
export type PaymentCallback = {
  provider: string;
  /** True only for a completed payment. Other events are recorded, not acted on. */
  succeeded: boolean;
  /** True only for an explicit provider failure event; other events are ignored. */
  failed?: boolean;
  reference: string;
  /** Set for refund events, which carry the refunded charge's reference. */
  refund?: RefundCallback;
  metadata: Record<string, unknown>;
  /** Kobo the provider says it collected; null when the event does not say. */
  amountKobo: number | null;
  currency: string | null;
  /** How the customer paid, as the provider names it; null when it does not say. */
  channel: string | null;
};

export type PaidAmount = {
  amountKobo: number | null;
  currency: string | null;
  channel?: string | null;
};

export interface PaymentGateway {
  /** Identifies which adapter answered, for the audit trail and the response. */
  readonly name: string;
  /**
   * True when the deployment wants checkout settled without contacting the
   * provider. The call sites still own settlement, because each flow has its
   * own post-payment work.
   */
  readonly demo?: boolean;
  /**
   * The header this provider signs with. Used only to decide which adapter to
   * try first — never to decide whether a callback is genuine. A header is
   * attacker-controlled; the signature is not.
   */
  readonly signatureHeader: string;
  /** False when credentials are absent, so a caller can degrade rather than throw. */
  isConfigured(): boolean;
  initiateCharge(request: ChargeRequest): Promise<ChargeInitiated>;
  /** Asks the provider to return money taken on a charge. Omit the amount to refund it in full. A queued refund answers pending and is finished by a callback. Throws PaymentGatewayError when refused. */
  refund(reference: string, amountKobo?: number): Promise<RefundResult>;
  /** Asks the provider where a refund stands, by the charge's reference. Unknown when the provider has no such refund. Throws PaymentGatewayError when it cannot be asked. */
  getRefundStatus(reference: string): Promise<RefundLookup>;
  /** Asks the provider whether a charge was paid, for when its callback is late. Throws PaymentGatewayError when it cannot be asked. */
  verifyCharge(reference: string): Promise<ChargeVerification>;
  /** Whether a callback body genuinely came from this provider. */
  verifyCallbackSignature(rawBody: string | Buffer, signature: string | undefined): boolean;
  /** Reads a verified callback into the shape the platform acts on. */
  parseCallback(body: Record<string, unknown>): PaymentCallback | null;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Every adapter the deployment knows about, for callback identification. */
export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');
