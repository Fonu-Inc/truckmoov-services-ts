import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  DotgoTransactionalSmsProvider,
  SmsProviderError,
  normalizeRecipient,
} from '../../../apps/auth/src/contexts/otp/dotgo-transactional-sms.provider';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

const post = vi.mocked(axios.post);

function provider(overrides: Partial<Record<string, string>> = {}) {
  const config = {
    otpSms: {
      baseUrl: 'https://konnect.dotgo.com',
      accountId: 'acc-1',
      apiToken: 'token-1',
      senderMask: 'FONU',
      callbackUrl: 'https://api.truckmoov.com/notify/sms/webhook',
      webhookSecret: 'hook-secret',
      dedupWindowSeconds: 45,
      ...overrides,
    },
  };
  return new DotgoTransactionalSmsProvider(config as never);
}

describe('Dotgo transactional SMS provider', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ status: 200, data: { id: 'ignored' } });
  });

  it('posts the same payload shape the Go notification service used', async () => {
    const result = await provider().send({
      to: '0803 000 0000',
      body: 'hello',
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, payload, options] = post.mock.calls[0];
    expect(url).toBe('https://konnect.dotgo.com/api/v1/Accounts/acc-1/Messages');
    expect(payload).toMatchObject({
      to: ['2348030000000'],
      body: 'hello',
      sender_mask: 'FONU',
    });
    expect((payload as { id: string }).id).toMatch(/^\d{12}$/);
    expect((payload as { callback_url: string }).callback_url).toBe(
      'https://api.truckmoov.com/notify/sms/webhook?token=hook-secret',
    );
    expect(options.headers.Authorization).toBe('token-1');
    expect(result.reference).toBe((payload as { id: string }).id);
  });

  it('uses a caller-supplied sender and omits an unusable callback', async () => {
    await provider({ callbackUrl: '<not-a-url>' }).send({
      to: '+2348030000000',
      body: 'hello',
      senderId: 'TRUCKMOOV',
    });

    const [, payload] = post.mock.calls[0];
    expect(payload).toMatchObject({ sender_mask: 'TRUCKMOOV' });
    expect(payload).not.toHaveProperty('callback_url');
  });

  it('refuses to send when the account is not configured', async () => {
    await expect(provider({ apiToken: '' }).send({
      to: '+2348030000000',
      body: 'hello',
    })).rejects.toBeInstanceOf(SmsProviderError);
    expect(post).not.toHaveBeenCalled();
  });

  it('surfaces a Dotgo error response', async () => {
    post.mockResolvedValue({ status: 401, data: { message: 'invalid token' } });

    await expect(provider().send({
      to: '+2348030000000',
      body: 'hello',
    })).rejects.toBeInstanceOf(SmsProviderError);
  });

  it('normalises Nigerian local and bare 10-digit numbers', () => {
    expect(normalizeRecipient('0803 000 0000')).toBe('2348030000000');
    expect(normalizeRecipient('8030000000')).toBe('2348030000000');
    expect(normalizeRecipient('+2348030000000')).toBe('2348030000000');
  });
});
