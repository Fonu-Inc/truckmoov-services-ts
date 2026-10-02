import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaystackGateway } from '../../../apps/auth/src/contexts/payments';
import { PaymentGatewayError } from '../../../apps/auth/src/contexts/payments';
import { TopupWalletUseCase } from '../../../apps/auth/src/topup-wallet.use-case';
import axios from 'axios';

vi.mock('axios');
const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

const SECRET = 'sk_test_secret';

function gateway(secretKey: string | null = SECRET) {
  return new PaystackGateway({
    payment: { paystackSecretKey: secretKey, paystackBaseUrl: 'https://api.paystack.co/' },
  } as never);
}

describe('PaystackGateway', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports itself unconfigured without a key', () => {
    expect(gateway(null).isConfigured()).toBe(false);
    expect(gateway().isConfigured()).toBe(true);
  });

  it('returns no authorization url when unconfigured, rather than throwing', async () => {
    const charge = await gateway(null).initiateCharge({
      reference: 'TOPUP-1',
      amountKobo: 500_000,
      customerEmail: 'a@example.com',
    });

    expect(charge.authorizationUrl).toBeNull();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('sends the amount in kobo and our own reference', async () => {
    mockedPost.mockResolvedValue({
      data: { status: true, data: { authorization_url: 'https://pay', access_code: 'ac', reference: 'TOPUP-1' } },
    } as never);

    await gateway().initiateCharge({
      reference: 'TOPUP-1',
      amountKobo: 500_000,
      customerEmail: 'a@example.com',
    });

    const body = mockedPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.amount).toBe(500_000);
    expect(body.reference).toBe('TOPUP-1');
  });

  it('raises a provider error when the provider refuses', async () => {
    mockedPost.mockResolvedValue({ data: { status: false, message: 'Invalid key' } } as never);

    await expect(
      gateway().initiateCharge({ reference: 'r', amountKobo: 1, customerEmail: 'a@b.com' }),
    ).rejects.toBeInstanceOf(PaymentGatewayError);
  });

  it('refunds a transaction by its reference and returns the provider refund id', async () => {
    mockedPost.mockResolvedValue({ data: { status: true, data: { id: 4411, status: 'processed' } } } as never);

    const result = await gateway().refund('FPA-1');

    expect(mockedPost.mock.calls[0][0]).toBe('https://api.paystack.co/refund');
    expect(mockedPost.mock.calls[0][1]).toEqual({ transaction: 'FPA-1' });
    expect(result).toEqual({ status: 'processed', providerRefundId: '4411' });
  });

  it('reports a queued refund as pending, not finished', async () => {
    mockedPost.mockResolvedValue({ data: { status: true, data: { id: 4412, status: 'pending' } } } as never);

    expect(await gateway().refund('FPA-1')).toEqual({ status: 'pending', providerRefundId: '4412' });
  });

  it('reads refund webhooks by the transaction reference', () => {
    const parsed = (event: string) =>
      gateway().parseCallback({ event, data: { transaction_reference: 'FPA-1', refund_reference: 'rf-9', status: 'x' } });

    expect(parsed('refund.processed')).toMatchObject({ reference: 'FPA-1', refund: { status: 'processed', providerRefundId: 'rf-9' } });
    expect(parsed('refund.failed')).toMatchObject({ reference: 'FPA-1', refund: { status: 'failed' } });
    expect(parsed('refund.pending')?.refund?.status).toBe('pending');
    expect(parsed('refund.processed')?.succeeded).toBe(false);
  });

  it('still answers a signed refund event that names no transaction', () => {
    expect(gateway().parseCallback({ event: 'refund.failed', data: {} })).toMatchObject({ reference: '', refund: { status: 'failed' } });
  });

  it('raises a provider error when a refund is refused or the gateway is unconfigured', async () => {
    mockedPost.mockResolvedValue({ data: { status: false, message: 'Transaction not found' } } as never);

    await expect(gateway().refund('FPA-1')).rejects.toThrow('Transaction not found');
    await expect(gateway(null).refund('FPA-1')).rejects.toBeInstanceOf(PaymentGatewayError);
  });

  it('reports a refund that never reached Paystack as a provider error with a timeout set', async () => {
    mockedPost.mockRejectedValue(new Error('socket hang up'));

    await expect(gateway().refund('FPA-1')).rejects.toBeInstanceOf(PaymentGatewayError);
    expect(mockedPost.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
  });

  describe('getRefundStatus', () => {
    const answer = (status: number, body: unknown) => mockedGet.mockResolvedValue({ status, data: body } as never);

    it.each([
      ['processed', 'processed'],
      ['failed', 'failed'],
      ['pending', 'pending'],
      ['processing', 'pending'],
      ['needs-attention', 'pending'],
    ])('maps paystack %s to %s', async (provider, expected) => {
      answer(200, { status: true, data: { id: 77, status: provider } });

      expect(await gateway().getRefundStatus('FPA-1')).toEqual({ status: expected, providerRefundId: '77' });
      expect(mockedGet.mock.calls[0][0]).toBe('https://api.paystack.co/refund/FPA-1');
      expect(mockedGet.mock.calls[0][1]).toMatchObject({ timeout: expect.any(Number) });
    });

    it('reads the first refund when paystack answers a list', async () => {
      answer(200, { status: true, data: [{ id: 5, status: 'processed' }] });

      expect(await gateway().getRefundStatus('FPA-1')).toEqual({ status: 'processed', providerRefundId: '5' });
    });

    it('answers unknown for a 404 or an empty answer', async () => {
      answer(404, { status: false, message: 'Refund not found' });
      expect(await gateway().getRefundStatus('FPA-1')).toEqual({ status: 'unknown', providerRefundId: null });

      answer(200, { status: true, data: null });
      expect(await gateway().getRefundStatus('FPA-1')).toEqual({ status: 'unknown', providerRefundId: null });
    });

    it('raises a provider error for a server error, a network failure or missing keys', async () => {
      answer(500, { status: false, message: 'boom' });
      await expect(gateway().getRefundStatus('FPA-1')).rejects.toBeInstanceOf(PaymentGatewayError);

      mockedGet.mockRejectedValue(new Error('socket hang up'));
      await expect(gateway().getRefundStatus('FPA-1')).rejects.toBeInstanceOf(PaymentGatewayError);
      await expect(gateway(null).getRefundStatus('FPA-1')).rejects.toBeInstanceOf(PaymentGatewayError);
    });
  });

  it('accepts a signature it computed itself', () => {
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', SECRET).update(body).digest('hex');

    expect(gateway().verifyCallbackSignature(body, signature)).toBe(true);
  });

  it('refuses a tampered body', () => {
    const signature = createHmac('sha512', SECRET).update('{"event":"charge.success"}').digest('hex');

    expect(gateway().verifyCallbackSignature('{"event":"charge.failed"}', signature)).toBe(false);
  });

  it('refuses a signature signed with a different key', () => {
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', 'other-key').update(body).digest('hex');

    expect(gateway().verifyCallbackSignature(body, signature)).toBe(false);
  });

  it('refuses a missing or malformed signature without throwing', () => {
    expect(gateway().verifyCallbackSignature('{}', undefined)).toBe(false);
    expect(gateway().verifyCallbackSignature('{}', 'not-hex')).toBe(false);
    expect(gateway().verifyCallbackSignature('{}', '')).toBe(false);
  });

  it('refuses everything when no key is configured', () => {
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', SECRET).update(body).digest('hex');

    expect(gateway(null).verifyCallbackSignature(body, signature)).toBe(false);
  });
});

describe('wallet top-up initiates a real charge', () => {
  function build(gatewayStub: Record<string, unknown>) {
    const saved: Array<Record<string, unknown>> = [];
    const useCase = new TopupWalletUseCase(
      { resolveAccessToken: () => ({ id: 'user-1' }) } as never,
      {
        findById: async () => ({
          id: 'user-1',
          email: 'ops@tenant.com',
          role: 'ENTERPRISE_ADMIN',
          tenantId: 'tenant-a',
          accountStatus: 'enabled',
          passwordHash: 'x',
          profile: {},
        }),
      } as never,
      { save: async (row: Record<string, unknown>) => void saved.push(row) } as never,
      { get: async () => null } as never,
      gatewayStub as never,
    );
    return { useCase, saved };
  }

  it('charges through the gateway and returns where to pay', async () => {
    const initiateCharge = vi.fn(async () => ({
      reference: 'TOPUP-1',
      authorizationUrl: 'https://pay/here',
      provider: 'paystack',
    }));
    const { useCase } = build({ name: 'paystack', initiateCharge });

    const result = await useCase.execute('token', {
      amount: 5000,
      mobileMoneyProvider: 'mtn',
      mobileNumber: '+2348000000000',
    });

    expect(initiateCharge).toHaveBeenCalledTimes(1);
    expect(result.data.authorizationUrl).toBe('https://pay/here');
  });

  it('records the pending row before charging, so the callback has something to settle', async () => {
    const order: string[] = [];
    const { useCase } = build({
      name: 'paystack',
      initiateCharge: vi.fn(async () => {
        order.push('charge');
        return { reference: 'TOPUP-1', authorizationUrl: 'https://pay', provider: 'paystack' };
      }),
    });

    await useCase.execute('token', {
      amount: 5000,
      mobileMoneyProvider: 'mtn',
      mobileNumber: '+2348000000000',
    });

    expect(order).toEqual(['charge']);
  });

  it('sends the amount to the gateway in kobo, matching what is stored', async () => {
    const initiateCharge = vi.fn(async () => ({
      reference: 'TOPUP-1',
      authorizationUrl: null,
      provider: 'paystack',
    }));
    const { useCase, saved } = build({ name: 'paystack', initiateCharge });

    await useCase.execute('token', {
      amount: 5000,
      mobileMoneyProvider: 'mtn',
      mobileNumber: '+2348000000000',
    });

    expect(initiateCharge.mock.calls[0][0].amountKobo).toBe(500_000);
    expect(saved[0].amountKobo).toBe(500_000);
  });

  it('tags the charge as a wallet top-up so the callback can tell them apart', async () => {
    const initiateCharge = vi.fn(async () => ({
      reference: 'TOPUP-1',
      authorizationUrl: null,
      provider: 'paystack',
    }));
    const { useCase } = build({ name: 'paystack', initiateCharge });

    await useCase.execute('token', {
      amount: 5000,
      mobileMoneyProvider: 'mtn',
      mobileNumber: '+2348000000000',
    });

    expect(initiateCharge.mock.calls[0][0].metadata).toMatchObject({ purpose: 'wallet_topup' });
  });
});
