import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  CommunicationRateRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  COMMUNICATION_CHANNELS,
  type CommunicationChannel,
  type CommunicationRate,
  type CommunicationRatesRepository,
  type RateUnit,
} from './communication-rates.repository';

function toRate(record: CommunicationRateRecord): CommunicationRate {
  return {
    id: record.id,
    channel: record.channel as CommunicationChannel,
    unit: record.unit as RateUnit,
    rateKobo: Number(record.rateKobo),
    enabled: record.enabled,
    description: record.description,
    effectiveFrom: record.effectiveFrom.toISOString(),
    createdBy: record.createdBy,
  };
}

@Injectable()
export class MikroCommunicationRatesRepository implements CommunicationRatesRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  /**
   * The newest row whose effective_from is at or before the moment asked about.
   * Resolving by time rather than by "latest" is what stops a repricing from
   * changing what an earlier debit cost.
   */
  async findEffective(channel: CommunicationChannel, at: Date): Promise<CommunicationRate | null> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.fork().find(
      CommunicationRateRecord,
      { channel, effectiveFrom: { $lte: at } } as never,
      { orderBy: { effectiveFrom: 'desc' }, limit: 1 },
    );
    return rows[0] ? toRate(rows[0]) : null;
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
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .fork()
      .find(CommunicationRateRecord, { channel } as never, { orderBy: { effectiveFrom: 'desc' } });
    return rows.map(toRate);
  }

  async append(rate: CommunicationRate): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    // Insert, never upsert: the table is a history and an update would rewrite
    // a rate that past debits were priced against.
    await orm.em.fork().insert(CommunicationRateRecord, {
      id: rate.id,
      channel: rate.channel,
      unit: rate.unit,
      rateKobo: rate.rateKobo,
      enabled: rate.enabled,
      description: rate.description,
      effectiveFrom: new Date(rate.effectiveFrom),
      createdBy: rate.createdBy,
      createdAt: new Date(),
    });
  }
}
