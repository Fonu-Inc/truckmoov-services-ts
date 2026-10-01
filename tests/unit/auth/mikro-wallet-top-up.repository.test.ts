import { describe, expect, it } from 'vitest';
import { toStored } from '../../../apps/auth/src/mikro-wallet-top-up.repository';

describe('mikro wallet top-up row mapping', () => {
  it('maps snake_case raw row with string bigint', () => {
    const settledAt = new Date('2026-10-01T10:00:00Z');
    const createdAt = new Date('2026-10-01T09:00:00Z');
    const stored = toStored({
      id: 't1',
      tenant_id: 'ten1',
      amount_kobo: '500000',
      provider: 'paystack',
      mobile_number: '08012345678',
      status: 'pending',
      reference: 'TOPUP-abc',
      settled_at: settledAt,
      created_at: createdAt,
    });
    expect(stored).toEqual({
      id: 't1',
      tenantId: 'ten1',
      amountKobo: 500000,
      provider: 'paystack',
      mobileNumber: '08012345678',
      status: 'pending',
      reference: 'TOPUP-abc',
      settledAt,
      createdAt,
    });
  });

  it('maps null settled_at to null', () => {
    const stored = toStored({
      id: 't1',
      tenant_id: 'ten1',
      amount_kobo: 100,
      provider: 'p',
      mobile_number: 'm',
      status: 'pending',
      reference: null,
      settled_at: null,
      created_at: new Date(),
    });
    expect(stored.settledAt).toBeNull();
    expect(stored.amountKobo).toBe(100);
  });
});
