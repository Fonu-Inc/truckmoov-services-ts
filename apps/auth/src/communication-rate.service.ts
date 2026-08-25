import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_UNITS,
  COMMUNICATION_RATES_REPOSITORY,
  ChannelDisabledError,
  assertRateWithinBounds,
  type CommunicationChannel,
  type CommunicationRate,
  type CommunicationRatesRepository,
} from './communication-rates.repository';

export class RateNotConfiguredError extends Error {
  constructor(channel: CommunicationChannel) {
    super(`No rate is configured for ${channel}`);
  }
}

export type PricedUsage = {
  channel: CommunicationChannel;
  quantity: number;
  unitRateKobo: number;
  totalKobo: number;
  rateId: string;
};

/**
 * Turns usage into money, and is the only thing allowed to.
 *
 * Nothing else may carry a rate. A charge computed from a literal in code is a
 * charge nobody can explain later and nobody can change without a deploy, which
 * is what this replaces.
 */
@Injectable()
export class CommunicationRateService {
  constructor(
    @Inject(COMMUNICATION_RATES_REPOSITORY)
    private readonly repository: CommunicationRatesRepository,
  ) {}

  /**
   * Prices usage at the rate that was live when it happened.
   *
   * occurredAt is the event's own time, not now. Pricing at "now" would let a
   * repricing change what an earlier message cost between it being sent and
   * being billed.
   */
  async price(
    channel: CommunicationChannel,
    quantity: number,
    occurredAt: Date = new Date(),
  ): Promise<PricedUsage> {
    const rate = await this.repository.findEffective(channel, occurredAt);
    if (!rate) throw new RateNotConfiguredError(channel);
    // Disabled means the channel is neither billable nor usable, so pricing it
    // is refused rather than returning zero. A zero would let a tenant keep
    // sending on a channel that is switched off, free.
    if (!rate.enabled) throw new ChannelDisabledError(channel);

    const units = Math.max(0, Math.ceil(quantity));
    return {
      channel,
      quantity: units,
      unitRateKobo: rate.rateKobo,
      totalKobo: rate.rateKobo * units,
      rateId: rate.id,
    };
  }

  async currentRates(): Promise<CommunicationRate[]> {
    return this.repository.findCurrent();
  }

  async history(channel: CommunicationChannel): Promise<CommunicationRate[]> {
    return this.repository.findHistory(channel);
  }

  /**
   * Records a new rate from a moment forward. Never edits the rate it replaces:
   * that row is what explains every debit already priced against it.
   */
  async reprice(
    channel: CommunicationChannel,
    rateKobo: number,
    options: { enabled?: boolean; description?: string; actorId: string; effectiveFrom?: Date },
  ): Promise<CommunicationRate> {
    assertRateWithinBounds(channel, rateKobo);

    const previous = await this.repository.findEffective(channel, new Date());
    const rate: CommunicationRate = {
      id: randomUUID(),
      channel,
      unit: CHANNEL_UNITS[channel],
      rateKobo,
      enabled: options.enabled ?? previous?.enabled ?? true,
      description: options.description ?? previous?.description ?? '',
      effectiveFrom: (options.effectiveFrom ?? new Date()).toISOString(),
      createdBy: options.actorId,
    };

    await this.repository.append(rate);
    return rate;
  }
}
