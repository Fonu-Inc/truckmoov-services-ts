import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryCommunicationRatesRepository } from '../../../apps/auth/src/in-memory-communication-rates.repository';
import {
  CommunicationRateService,
  RateNotConfiguredError,
} from '../../../apps/auth/src/communication-rate.service';
import {
  CHANNEL_UNITS,
  ChannelDisabledError,
  RateOutOfBoundsError,
  assertRateWithinBounds,
} from '../../../apps/auth/src/communication-rates.repository';

describe('rates come from configuration, never from a literal', () => {
  let service: CommunicationRateService;

  beforeEach(() => {
    service = new CommunicationRateService(new InMemoryCommunicationRatesRepository());
  });

  it('prices usage from the configured rate', async () => {
    const priced = await service.price('sms', 100);

    expect(priced.unitRateKobo).toBe(600);
    expect(priced.totalKobo).toBe(60_000);
  });

  it('refuses to price a channel with no rate configured', async () => {
    const empty = new CommunicationRateService({
      findEffective: async () => null,
      findCurrent: async () => [],
      findHistory: async () => [],
      append: async () => {},
    } as never);

    await expect(empty.price('sms', 1)).rejects.toBeInstanceOf(RateNotConfiguredError);
  });

  it('records which rate row produced the charge', async () => {
    const priced = await service.price('sms', 1);

    expect(priced.rateId).toBe('rate-sms-seed');
  });
});

describe('a repricing must not change what was already charged', () => {
  let repository: InMemoryCommunicationRatesRepository;
  let service: CommunicationRateService;

  beforeEach(() => {
    repository = new InMemoryCommunicationRatesRepository();
    service = new CommunicationRateService(repository);
  });

  it('prices an old event at the old rate', async () => {
    const before = new Date('2026-01-01T00:00:00.000Z');
    await service.reprice('sms', 900, {
      actorId: 'staff-1',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
    });

    const old = await service.price('sms', 10, before);
    const now = await service.price('sms', 10, new Date('2026-07-01T00:00:00.000Z'));

    expect(old.unitRateKobo).toBe(600);
    expect(now.unitRateKobo).toBe(900);
  });

  it('keeps the superseded rate, so an old invoice can still be explained', async () => {
    await service.reprice('sms', 900, { actorId: 'staff-1' });

    const history = await service.history('sms');
    expect(history).toHaveLength(2);
    expect(history.map((rate) => rate.rateKobo)).toContain(600);
  });

  it('records who changed it', async () => {
    const rate = await service.reprice('sms', 700, { actorId: 'staff-9' });

    expect(rate.createdBy).toBe('staff-9');
  });

  it('carries the previous enabled state forward when not stated', async () => {
    await service.reprice('sms', 700, { actorId: 'staff-1', enabled: false });
    const next = await service.reprice('sms', 800, { actorId: 'staff-1' });

    expect(next.enabled).toBe(false);
  });
});

// A mistyped rate would drain every wallet before anyone noticed.
describe('rate bounds', () => {
  it('refuses a rate far above the plausible range', () => {
    expect(() => assertRateWithinBounds('sms', 60_000)).toThrow(RateOutOfBoundsError);
  });

  it('refuses a zero or negative rate', () => {
    expect(() => assertRateWithinBounds('sms', 0)).toThrow(RateOutOfBoundsError);
    expect(() => assertRateWithinBounds('sms', -100)).toThrow(RateOutOfBoundsError);
  });

  it('allows a sub-Naira rate, which is plausible for SMS', () => {
    expect(() => assertRateWithinBounds('sms', 50)).not.toThrow();
  });

  it('refuses to store an out-of-range rate at all', async () => {
    const service = new CommunicationRateService(new InMemoryCommunicationRatesRepository());

    await expect(
      service.reprice('sms', 60_000, { actorId: 'staff-1' }),
    ).rejects.toBeInstanceOf(RateOutOfBoundsError);
    await expect(service.history('sms')).resolves.toHaveLength(1);
  });
});

describe('a disabled channel is neither billable nor usable', () => {
  it('refuses to price it rather than charging zero', async () => {
    const service = new CommunicationRateService(new InMemoryCommunicationRatesRepository());
    await service.reprice('whatsapp', 1_000, { actorId: 'staff-1', enabled: false });

    await expect(service.price('whatsapp', 5)).rejects.toBeInstanceOf(ChannelDisabledError);
  });

  it('leaves other channels alone', async () => {
    const service = new CommunicationRateService(new InMemoryCommunicationRatesRepository());
    await service.reprice('whatsapp', 1_000, { actorId: 'staff-1', enabled: false });

    await expect(service.price('sms', 1)).resolves.toBeTruthy();
  });
});

describe('units', () => {
  it('bills the IoT SIM monthly, not per message', () => {
    expect(CHANNEL_UNITS.iot_sim).toBe('recurring_monthly');
  });

  it('bills voice by the minute and messaging by the message', () => {
    expect(CHANNEL_UNITS.voice).toBe('per_minute');
    expect(CHANNEL_UNITS.sms).toBe('per_message');
    expect(CHANNEL_UNITS.whatsapp).toBe('per_message');
  });

  it('rounds a part unit up, so a partial minute is not free', async () => {
    const service = new CommunicationRateService(new InMemoryCommunicationRatesRepository());

    const priced = await service.price('voice', 2.1);

    expect(priced.quantity).toBe(3);
    expect(priced.totalKobo).toBe(6_600);
  });
});
