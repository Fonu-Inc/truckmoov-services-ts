import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PAYMENT_GATEWAYS,
  type PaymentCallback,
  type PaymentGateway,
} from './payment-gateway.port';

/**
 * Decides which provider sent a callback, for the one endpoint they all post to.
 *
 * Identification is by signature, not by header, path or source address:
 *
 *  - a header name is attacker-controlled, so it can suggest which adapter to
 *    try first but can never establish who sent the request;
 *  - the source address is the ingress proxy once traffic passes through Kong,
 *    which would mean trusting a forwarded-for header — client-settable — and
 *    providers rotate their ranges anyway;
 *  - only the provider holding the shared secret can produce a signature that
 *    verifies, so a verifying signature is proof of origin and of the body
 *    being unmodified in one step.
 *
 * The header hint is an optimisation: with it, the usual case is one HMAC. It
 * is never the deciding factor, so a forged or absent header costs a little
 * work and changes no outcome.
 */
@Injectable()
export class PaymentGatewayRegistry {
  private readonly logger = new Logger(PaymentGatewayRegistry.name);

  constructor(
    @Inject(PAYMENT_GATEWAYS) private readonly gateways: readonly PaymentGateway[],
  ) {}

  configured(): readonly PaymentGateway[] {
    return this.gateways.filter((gateway) => gateway.isConfigured());
  }

  /** Returns null when no configured provider claims the callback. */
  identify(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): PaymentGateway | null {
    const candidates = this.orderByHeaderHint(headers);

    for (const gateway of candidates) {
      const signature = headerValue(headers, gateway.signatureHeader);
      if (!signature) continue;
      if (gateway.verifyCallbackSignature(rawBody, signature)) return gateway;
    }

    return null;
  }

  parse(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): PaymentCallback | null {
    const gateway = this.identify(rawBody, headers);
    if (!gateway) {
      // Deliberately does not say which provider was expected. A caller probing
      // this endpoint learns nothing about what is configured.
      this.logger.warn('payment_callback_unidentified');
      return null;
    }
    return gateway.parseCallback(body);
  }

  /** The provider whose header is present is tried first; the rest still follow. */
  private orderByHeaderHint(
    headers: Record<string, string | string[] | undefined>,
  ): readonly PaymentGateway[] {
    const configured = this.configured();
    const hinted = configured.filter((gateway) => headerValue(headers, gateway.signatureHeader));
    const rest = configured.filter((gateway) => !hinted.includes(gateway));
    return [...hinted, ...rest];
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}
