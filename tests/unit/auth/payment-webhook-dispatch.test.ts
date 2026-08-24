import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaymentGatewayRegistry, PaystackGateway } from '../../../apps/auth/src/contexts/payments';
import type { PaymentCallback, PaymentGateway } from '../../../apps/auth/src/contexts/payments';

const PAYSTACK_SECRET = 'sk_paystack';
const OTHER_SECRET = 'sk_other';

function paystack(secret: string | null = PAYSTACK_SECRET) {
  return new PaystackGateway({
    payment: { paystackSecretKey: secret, paystackBaseUrl: 'https://api.paystack.co' },
  } as never);
}

/** A second provider, to prove dispatch is by signature rather than by name. */
class OtherGateway implements PaymentGateway {
  readonly name = 'other';
  readonly signatureHeader = 'verif-hash';
  isConfigured(): boolean {
    return true;
  }
  async initiateCharge(): Promise<never> {
    throw new Error('not used');
  }
  verifyCallbackSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    return createHmac('sha512', OTHER_SECRET).update(rawBody).digest('hex') === signature;
  }
  parseCallback(body: Record<string, unknown>): PaymentCallback | null {
    return {
      provider: this.name,
      succeeded: body['status'] === 'successful',
      reference: String(body['txRef'] ?? ''),
      metadata: {},
    };
  }
}

const BODY = JSON.stringify({
  event: 'charge.success',
  data: { reference: 'TOPUP-1', metadata: { tenantId: 'tenant-a', purpose: 'wallet_topup' } },
});

function sign(secret: string, body = BODY) {
  return createHmac('sha512', secret).update(body).digest('hex');
}

function registry(gateways: PaymentGateway[]) {
  return new PaymentGatewayRegistry(gateways as never);
}

describe('one webhook, dispatched by signature', () => {
  it('identifies the provider whose signature verifies', () => {
    const gateway = registry([paystack(), new OtherGateway()]).identify(BODY, {
      'x-paystack-signature': sign(PAYSTACK_SECRET),
    });

    expect(gateway?.name).toBe('paystack');
  });

  it('identifies a different provider from the same endpoint', () => {
    const gateway = registry([paystack(), new OtherGateway()]).identify(BODY, {
      'verif-hash': sign(OTHER_SECRET),
    });

    expect(gateway?.name).toBe('other');
  });

  it('refuses a callback no provider signed', () => {
    expect(registry([paystack()]).identify(BODY, { 'x-paystack-signature': 'deadbeef' })).toBeNull();
  });

  it('refuses a callback with no signature at all', () => {
    expect(registry([paystack()]).identify(BODY, {})).toBeNull();
  });

  // The point of signature dispatch: a forged header changes nothing.
  it('refuses a body signed by one provider but labelled as another', () => {
    const gateway = registry([paystack(), new OtherGateway()]).identify(BODY, {
      'x-paystack-signature': sign(OTHER_SECRET),
    });

    expect(gateway).toBeNull();
  });

  it('still identifies correctly when a decoy header is also present', () => {
    const gateway = registry([paystack(), new OtherGateway()]).identify(BODY, {
      'verif-hash': 'not-a-real-signature',
      'x-paystack-signature': sign(PAYSTACK_SECRET),
    });

    expect(gateway?.name).toBe('paystack');
  });

  it('refuses a body modified after signing', () => {
    const tampered = BODY.replace('TOPUP-1', 'TOPUP-2');

    expect(
      registry([paystack()]).identify(tampered, { 'x-paystack-signature': sign(PAYSTACK_SECRET) }),
    ).toBeNull();
  });

  it('ignores an unconfigured provider', () => {
    expect(registry([paystack(null)]).configured()).toHaveLength(0);
    expect(
      registry([paystack(null)]).identify(BODY, { 'x-paystack-signature': sign(PAYSTACK_SECRET) }),
    ).toBeNull();
  });

  it('reads a verified callback into the shape the platform acts on', () => {
    const callback = registry([paystack()]).parse(BODY, {
      'x-paystack-signature': sign(PAYSTACK_SECRET),
    }, JSON.parse(BODY));

    expect(callback).toMatchObject({
      provider: 'paystack',
      succeeded: true,
      reference: 'TOPUP-1',
    });
    expect(callback?.metadata).toMatchObject({ purpose: 'wallet_topup' });
  });

  it('marks a non-success event as not succeeded rather than dropping it', () => {
    const failed = JSON.stringify({ event: 'charge.failed', data: { reference: 'TOPUP-1' } });
    const callback = registry([paystack()]).parse(failed, {
      'x-paystack-signature': sign(PAYSTACK_SECRET, failed),
    }, JSON.parse(failed));

    expect(callback?.succeeded).toBe(false);
  });

  it('returns null for a verified body carrying no reference', () => {
    const noRef = JSON.stringify({ event: 'charge.success', data: {} });
    const callback = registry([paystack()]).parse(noRef, {
      'x-paystack-signature': sign(PAYSTACK_SECRET, noRef),
    }, JSON.parse(noRef));

    expect(callback).toBeNull();
  });
});
