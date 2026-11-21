import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { InternalOtpController } from '../../../apps/auth/src/contexts/otp/internal-otp.controller';
import { SmsProviderError } from '../../../apps/auth/src/contexts/otp/dotgo-transactional-sms.provider';

const DTO = { channel: 'sms' as const, to: '+2347043863010', otp: '123456' };

function harness(caller: string | null, send = vi.fn(async () => ({
  success: true as const,
  channel: 'sms' as const,
  message: 'OTP accepted for delivery',
  reference: 'ref-1',
}))) {
  const serviceFor = vi.fn().mockResolvedValue(caller);
  const controller = new InternalOtpController(
    { serviceFor } as never,
    { send } as never,
  );
  return { controller, serviceFor, send };
}

describe('internal unified OTP route', () => {
  it('only answers an allowed service caller', async () => {
    const { controller, serviceFor } = harness(null);

    await expect(controller.send(DTO, {})).rejects.toThrow('Invalid service token');
    expect(serviceFor).toHaveBeenCalledWith({}, [
      'notification',
      'fleet',
      'dispatch',
      'realtime',
    ]);
  });

  it('returns the reference for an allowed caller', async () => {
    const { controller, send } = harness('notification');

    await expect(controller.send(DTO, {})).resolves.toMatchObject({
      reference: 'ref-1',
      channel: 'sms',
    });
    expect(send).toHaveBeenCalledWith(DTO);
  });

  it('answers a provider failure as a retryable 503', async () => {
    const { controller } = harness(
      'notification',
      vi.fn(async () => { throw new SmsProviderError('dotgo down'); }),
    );

    await expect(controller.send(DTO, {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
