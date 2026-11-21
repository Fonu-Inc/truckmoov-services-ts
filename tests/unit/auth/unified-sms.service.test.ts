import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UnifiedSmsService } from '../../../apps/auth/src/contexts/otp/unified-sms.service';
import { SmsProviderError } from '../../../apps/auth/src/contexts/otp/dotgo-transactional-sms.provider';

function service(provider: { send: ReturnType<typeof vi.fn> }) {
  const config = {
    otpSms: { dedupWindowSeconds: 45 },
  };
  return new UnifiedSmsService(provider as never, null, config as never);
}

function provider(reference = '123456789012') {
  return { send: vi.fn(async () => ({ reference })) };
}

describe('unified SMS service', () => {
  it('sends a default OTP message and returns the provider reference', async () => {
    const sms = provider();
    const result = await service(sms).send({
      channel: 'sms',
      to: '+2347043863010',
      otp: '123456',
    });

    expect(sms.send).toHaveBeenCalledWith({
      to: '+2347043863010',
      senderId: undefined,
      body: 'Your verification code is 123456. It expires in 10 minutes. Do not share it with anyone.',
    });
    expect(result).toEqual({
      success: true,
      channel: 'sms',
      message: 'OTP accepted for delivery',
      reference: '123456789012',
    });
  });

  it('replaces {{otp}} in a custom message', async () => {
    const sms = provider();
    await service(sms).send({
      channel: 'sms',
      to: '+2347043863010',
      otp: '987654',
      senderId: 'TRUCKMOOV',
      message: '{{otp}} is your TruckMoov code.',
    });

    expect(sms.send).toHaveBeenCalledWith({
      to: '+2347043863010',
      senderId: 'TRUCKMOOV',
      body: '987654 is your TruckMoov code.',
    });
  });

  it('sends a plain SMS when otp is omitted', async () => {
    const sms = provider();
    await service(sms).send({
      channel: 'sms',
      to: '+2347043863010',
      message: 'Your driver has been assigned.',
    });

    expect(sms.send).toHaveBeenCalledWith({
      to: '+2347043863010',
      senderId: undefined,
      body: 'Your driver has been assigned.',
    });
  });

  it('does not send a duplicate OTP to the same number inside the window', async () => {
    const sms = provider();
    const sut = service(sms);

    await sut.send({ channel: 'sms', to: '+2347043863010', otp: '123456' });
    const duplicate = await sut.send({ channel: 'sms', to: '+2347043863010', otp: '123456' });

    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(duplicate.message).toBe('OTP accepted for delivery');
    expect(duplicate.reference).toBeTruthy();
  });

  it('scopes duplicate suppression by dedupKey', async () => {
    const sms = provider();
    const sut = service(sms);

    await sut.send({
      channel: 'sms', to: '+2347043863010', otp: '111111', dedupKey: 'app-1',
    });
    await sut.send({
      channel: 'sms', to: '+2347043863010', otp: '222222', dedupKey: 'app-2',
    });

    expect(sms.send).toHaveBeenCalledTimes(2);
  });

  it('rejects a request with neither otp nor message', async () => {
    await expect(service(provider()).send({
      channel: 'sms',
      to: '+2347043863010',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces provider failures', async () => {
    const sms = { send: vi.fn(async () => { throw new SmsProviderError('dotgo down'); }) };

    await expect(service(sms).send({
      channel: 'sms',
      to: '+2347043863010',
      message: 'hello',
    })).rejects.toBeInstanceOf(SmsProviderError);
  });
});
