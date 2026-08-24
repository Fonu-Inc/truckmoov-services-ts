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

export interface PaymentGateway {
  /** Identifies which adapter answered, for the audit trail and the response. */
  readonly name: string;
  /** False when credentials are absent, so a caller can degrade rather than throw. */
  isConfigured(): boolean;
  initiateCharge(request: ChargeRequest): Promise<ChargeInitiated>;
  /** Whether a callback body genuinely came from this provider. */
  verifyCallbackSignature(rawBody: string | Buffer, signature: string | undefined): boolean;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
