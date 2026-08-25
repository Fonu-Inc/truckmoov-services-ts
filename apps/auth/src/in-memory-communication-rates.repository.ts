import { Injectable } from '@nestjs/common';
import {
  CHANNEL_UNITS,
  COMMUNICATION_CHANNELS,
  type CommunicationChannel,
  type CommunicationRate,
  type CommunicationRatesRepository,
} from './communication-rates.repository';

const SEED_KOBO: Record<CommunicationChannel, number> = {
  sms: 600,
  whatsapp: 1_000,
  voice: 2_200,
  ai: 5_000,
  iot_sim: 50_000,
};

@Injectable()
export class InMemoryCommunicationRatesRepository implements CommunicationRatesRepository {
  private readonly rates: CommunicationRate[] = COMMUNICATION_CHANNELS.map((channel) => ({
    id: `rate-${channel}-seed`,
    channel,
    unit: CHANNEL_UNITS[channel],
    rateKobo: SEED_KOBO[channel],
    enabled: true,
    description: `${channel} rate`,
    effectiveFrom: new Date(0).toISOString(),
    createdBy: null,
  }));

  async findEffective(channel: CommunicationChannel, at: Date): Promise<CommunicationRate | null> {
    const candidates = this.rates
      .filter((rate) => rate.channel === channel && new Date(rate.effectiveFrom) <= at)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
    return candidates[0] ?? null;
  }

  async findCurrent(): Promise<CommunicationRate[]> {
    const now = new Date();
    const current: CommunicationRate[] = [];
    for (const channel of COMMUNICATION_CHANNELS) {
      const rate = await this.findEffective(channel, now);
      if (rate) current.push(rate);
    }
    return current;
  }

  async findHistory(channel: CommunicationChannel): Promise<CommunicationRate[]> {
    return this.rates
      .filter((rate) => rate.channel === channel)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  }

  async append(rate: CommunicationRate): Promise<void> {
    this.rates.push({ ...rate });
  }
}
