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
  reference: string;
  metadata: Record<string, unknown>;
};

export interface PaymentGateway {
  /** Identifies which adapter answered, for the audit trail and the response. */
  readonly name: string;
  /**
   * The header this provider signs with. Used only to decide which adapter to
   * try first — never to decide whether a callback is genuine. A header is
   * attacker-controlled; the signature is not.
   */
  readonly signatureHeader: string;
  /** False when credentials are absent, so a caller can degrade rather than throw. */
  isConfigured(): boolean;
  initiateCharge(request: ChargeRequest): Promise<ChargeInitiated>;
  /** Whether a callback body genuinely came from this provider. */
  verifyCallbackSignature(rawBody: string | Buffer, signature: string | undefined): boolean;
  /** Reads a verified callback into the shape the platform acts on. */
  parseCallback(body: Record<string, unknown>): PaymentCallback | null;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Every adapter the deployment knows about, for callback identification. */
export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');
