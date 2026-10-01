import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../../apps/auth/src/onboarding.controller';

const PAID = { amountKobo: 500000, currency: 'NGN' };

function callback(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'paystack',
    succeeded: true,
    reference: 'REF-1',
    metadata: { kind: 'onboarding', tenantId: 'tenant-a' },
    ...PAID,
    ...overrides,
  };
}

function build(parsed: unknown) {
  const confirm = vi.fn().mockResolvedValue(undefined);
  const activate = vi.fn().mockResolvedValue(undefined);
  const settle = vi.fn().mockResolvedValue({ outcome: 'credited', tenantId: 'tenant-a' });
  const emit = vi.fn();
  const restore = { onPaymentSettled: vi.fn().mockResolvedValue(undefined), onApplicationPaymentSettled: vi.fn().mockResolvedValue(undefined) };
  const controller = Object.create(OnboardingController.prototype);
  Object.assign(controller, {
    logger: { error: vi.fn() },
    gatewayRegistry: { configured: () => [{}], parse: () => parsed },
    confirmApplicationPayment: { execute: confirm },
    activateSubscriptionUseCase: { execute: activate },
    settleWalletTopUpUseCase: { execute: settle },
    paymentEventService: { emit },
    enforcementRestore: restore,
  });
  const call = () => controller.paystackWebhook({ headers: {}, rawBody: Buffer.from('{}') }, {});
  return { call, confirm, activate, settle, emit, restore };
}

describe('payment webhook settlement', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build(callback());
  });

  it('acknowledges when every handler succeeds and passes the paid amount', async () => {
    await expect(ctx.call()).resolves.toEqual({ received: true });
    expect(ctx.confirm).toHaveBeenCalledWith('REF-1', true, PAID);
    expect(ctx.activate).toHaveBeenCalledWith('tenant-a', 'REF-1', expect.any(Object), PAID);
    expect(ctx.settle).toHaveBeenCalledWith('REF-1', PAID);
  });

  it('asks enforcement to restore after each kind of settlement', async () => {
    await ctx.call();
    expect(ctx.restore.onApplicationPaymentSettled).toHaveBeenCalledWith('REF-1');
    expect(ctx.restore.onPaymentSettled).toHaveBeenCalledWith('tenant-a', 'subscription');
    expect(ctx.restore.onPaymentSettled).toHaveBeenCalledWith('tenant-a', 'wallet_topup');
  });

  it('does not ask enforcement to restore when settlement fails or the payment did not succeed', async () => {
    ctx.confirm.mockRejectedValue(new Error('db down'));
    await expect(ctx.call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.restore.onApplicationPaymentSettled).not.toHaveBeenCalled();

    const failed = build(callback({ succeeded: false, failed: true }));
    await failed.call();
    expect(failed.restore.onApplicationPaymentSettled).not.toHaveBeenCalled();
    expect(failed.restore.onPaymentSettled).not.toHaveBeenCalled();
  });

  it('does not restore on a wallet top-up that was refused for the wrong amount', async () => {
    ctx.settle.mockResolvedValue({ outcome: 'amount_mismatch', tenantId: 'tenant-a' });
    await ctx.call();
    expect(ctx.restore.onPaymentSettled).not.toHaveBeenCalledWith('tenant-a', 'wallet_topup');
  });

  it('answers 5xx after the other handlers ran when one throws', async () => {
    ctx.confirm.mockRejectedValue(new Error('db down'));

    await expect(ctx.call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.activate).toHaveBeenCalled();
    expect(ctx.settle).toHaveBeenCalled();
  });

  it('answers 5xx when the wallet settlement throws', async () => {
    ctx.settle.mockRejectedValue(new Error('ledger down'));

    await expect(ctx.call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.confirm).toHaveBeenCalled();
    expect(ctx.activate).toHaveBeenCalled();
  });

  it.each(['already_settled', 'unknown_reference', 'amount_mismatch'])(
    'treats outcome %s as success',
    async (outcome) => {
      ctx.settle.mockResolvedValue({ outcome, tenantId: null });

      await expect(ctx.call()).resolves.toEqual({ received: true });
      expect(ctx.emit).toHaveBeenCalledTimes(1);
    },
  );

  it('is a no-op for an unsuccessful unknown callback', async () => {
    ctx = build(callback({ succeeded: false, metadata: {} }));

    await expect(ctx.call()).resolves.toEqual({ received: true });
    expect(ctx.confirm).not.toHaveBeenCalled();
    expect(ctx.activate).not.toHaveBeenCalled();
    expect(ctx.settle).not.toHaveBeenCalled();
  });
});
