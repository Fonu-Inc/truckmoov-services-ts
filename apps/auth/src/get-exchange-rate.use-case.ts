import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';

type CachedRate = { ngnPerUsd: number; fetchedAt: Date };
type ExchangeRateApiResponse = {
  result: string;
  conversion_rates: Record<string, number>;
};

@Injectable()
export class GetExchangeRateUseCase {
  private readonly logger = new Logger(GetExchangeRateUseCase.name);
  private cache: CachedRate | null = null;
  private readonly ttlMs = 30 * 60 * 1000;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(): Promise<{
    status: boolean;
    message: string;
    data: { ngnPerUsd: number; source: string; fetchedAt: string };
  }> {
    if (this.cache && Date.now() - this.cache.fetchedAt.getTime() < this.ttlMs) {
      return this.buildResponse(this.cache, 'cache');
    }

    const apiKey = this.config.payment.exchangeRateApiKey;
    if (!apiKey) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not set; returning fallback rate');
      const fallback: CachedRate = { ngnPerUsd: 1600, fetchedAt: new Date() };
      this.cache = fallback;
      return this.buildResponse(fallback, 'fallback');
    }

    try {
      const { data: json } = await axios.get<ExchangeRateApiResponse>(
        `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
      );
      if (json.result !== 'success') throw new Error('API error');
      const ngnPerUsd = json.conversion_rates['NGN'];
      if (!ngnPerUsd) throw new Error('NGN rate missing');
      this.cache = { ngnPerUsd, fetchedAt: new Date() };
      return this.buildResponse(this.cache, 'live');
    } catch (err) {
      this.logger.error('Exchange rate fetch failed', err);
      const fallback: CachedRate = {
        ngnPerUsd: this.cache?.ngnPerUsd ?? 1600,
        fetchedAt: new Date(),
      };
      return this.buildResponse(fallback, 'fallback');
    }
  }

  private buildResponse(rate: CachedRate, source: string) {
    return {
      status: true,
      message: 'success',
      data: {
        ngnPerUsd: rate.ngnPerUsd,
        source,
        fetchedAt: rate.fetchedAt.toISOString(),
      },
    };
  }
}
